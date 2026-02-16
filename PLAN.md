# SMS - Stage Management System (器材倉儲管理系統)

## Context

燈光音響從業者需要一套客製化的器材倉儲管理系統，解決以下痛點：
- 確認並記錄目前器材動向（在倉庫 / 活動 / 外租 / 送修）
- 確認並規劃未來器材動向（避免衝突、資源最佳化）
- 紀錄各器材的出場歷史及維修資訊
- 在活動中新增調度事件，做到層級化（活動 → 調度事件）的管理
- 支援多使用者、細粒度權限控制與雙人確認機制
- 手機優先的 responsive 設計

---

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | Vite + React 18 + TypeScript | SPA, 快速 HMR, 內部系統不需 SSR |
| UI | Tailwind CSS 4 + shadcn/ui | Mobile-first, accessible, 高度自訂 |
| Server State | TanStack Query v5 | 快取、同步、optimistic update |
| Client State | Zustand v5 | 輕量、簡單 API |
| Forms | React Hook Form + Zod | 效能好、驗證型別安全 |
| Tables | TanStack Table v8 | Headless, 彈性高 |
| Backend | Django 5.1 + Django REST Framework | 成熟 ORM、內建 Auth、權限系統 |
| Auth | JWT (SimpleJWT) | 適合 SPA, stateless |
| Database | PostgreSQL 16 | JSONB 支援自訂欄位、GIN index |
| Task Queue | Celery + Redis | 非同步通知、定期任務 |
| Deployment | Docker Compose + Nginx + VPS | 方便部署、可複製 |

---

## Project Structure

```
SMS/
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── Makefile
├── PLAN.md
│
├── backend/
│   ├── Dockerfile / Dockerfile.prod
│   ├── requirements/{base,dev,prod}.txt
│   ├── manage.py
│   ├── config/
│   │   ├── settings/{base,dev,prod}.py
│   │   ├── urls.py
│   │   ├── wsgi.py / asgi.py
│   │   └── celery.py
│   ├── apps/
│   │   ├── accounts/          # User, Organization, permissions
│   │   ├── equipment/         # Category, Model, Item, StatusLog, FaultRecord
│   │   ├── custom_fields/     # CustomFieldDefinition
│   │   ├── schedules/         # Schedule, ScheduleEquipment, CheckoutRecord
│   │   ├── rentals/           # RentalAgreement, RentalAgreementLine
│   │   ├── warehouse/         # WarehouseTransaction (出入倉批次操作)
│   │   ├── transfers/         # EquipmentTransfer (Schedule 間直接移轉)
│   │   ├── notifications/     # Notification, Preferences, Celery tasks
│   │   └── audit/             # AuditLog
│   └── common/                # Base models, pagination, utils
│
├── frontend/
│   ├── Dockerfile / Dockerfile.prod
│   ├── package.json
│   └── src/
│       ├── components/
│       │   ├── ui/                     # shadcn/ui primitives
│       │   ├── layout/                 # AppShell, Sidebar, TopBar
│       │   ├── dashboard/              # StatusCards, UpcomingSchedules, etc.
│       │   ├── equipment-selector/     # 核心共用選取元件
│       │   └── common/                 # 通用 business components
│       ├── features/
│       │   ├── auth/
│       │   ├── equipment/
│       │   ├── schedules/
│       │   ├── warehouse/
│       │   ├── rentals/
│       │   ├── repairs/
│       │   ├── notifications/
│       │   └── dashboard/
│       ├── hooks/
│       ├── lib/                        # API client (axios)
│       ├── routes/
│       ├── stores/                     # Zustand
│       ├── types/
│       └── utils/
│
└── nginx/
    ├── nginx.conf
    └── nginx.prod.conf
```

---

## Database Schema

### Design Principles

- 所有 model 繼承 `TimestampMixin`（created_at, updated_at）+ `UUIDMixin`（對外 API 用 UUID）
- 軟刪除用 `is_active` flag
- **統一出入庫模型**：所有設備物理移動（活動、送修、外租、租入收發）都是 CHECK_OUT 或 CHECK_IN，「原因」由關聯的 Schedule 或 RentalAgreement 提供
- **狀態推導**：`EquipmentItem.current_status` 記錄設備是否在庫，「顯示狀態」（活動中/維修中/外租中）從關聯的 Schedule type 推導
- **Event Sourcing**：`EquipmentStatusLog` 為 single source of truth，`current_status` 為 denormalized cache
- **Computed over Stored**：`CheckoutRecord` 為出入庫數量的 single source of truth，`ScheduleEquipment` 只存 `quantity_planned`

### Model Overview (ER)

```
Organization 1──N User
User 1──N WarehouseTransaction (performed_by / confirmed_by)
User 1──N Schedule (created_by)

EquipmentCategory 1──N EquipmentCategory (self, parent, tree structure)
EquipmentCategory 1──N EquipmentModel
EquipmentModel 1──N EquipmentItem

CustomFieldDefinition ──── entity_type: equipment_model | equipment_item
EquipmentModel.custom_fields (JSONB)
EquipmentItem.custom_fields (JSONB)

EquipmentItem 1──N EquipmentStatusLog (append-only, source of truth)
EquipmentItem N──1 RentalAgreement (nullable, for rented-in items)

Schedule 1──N Schedule (self, parent → dispatch_events)
Schedule 1──N ScheduleEquipment
ScheduleEquipment 1──N CheckoutRecord (source of truth for quantities)

EquipmentTransfer N──1 Schedule (from_schedule)
EquipmentTransfer N──1 Schedule (to_schedule)
EquipmentTransfer 1──N TransferLineItem
CheckoutRecord N──1 EquipmentTransfer (nullable, for transferred records)
EquipmentStatusLog N──1 EquipmentTransfer (nullable, for TRANSFER actions)

RentalAgreement 1──N RentalAgreementLine
RentalAgreement 1──N EquipmentItem (rented-in items)

WarehouseTransaction N──1 Schedule (nullable, for event/repair/rental-out)
WarehouseTransaction N──1 RentalAgreement (nullable, for rental-in receive/return)
WarehouseTransaction 1──N TransactionLineItem

Notification N──1 User (recipient)
UserNotificationPreference: user × event_type × channel matrix
AuditLog: immutable operation log
```

---

### accounts app

```python
class Organization(TimestampMixin, UUIDMixin):
    name: CharField(255)
    slug: SlugField(unique)
    is_active: BooleanField(default=True)

class User(AbstractUser, TimestampMixin, UUIDMixin):
    organization: FK(Organization, nullable)  # multi-tenant 預留
    phone: CharField(20)
    is_external: BooleanField(default=False)
    # Granular permission flags
    can_check_in: BooleanField(default=False)
    can_check_out: BooleanField(default=False)
    requires_confirmation: BooleanField(default=False)
    can_manage_equipment: BooleanField(default=False)
    can_manage_schedules: BooleanField(default=False)
    can_manage_users: BooleanField(default=False)
    can_view_reports: BooleanField(default=False)
```

---

### equipment app

```python
class EquipmentCategory(TimestampMixin, UUIDMixin):
    name: CharField(255)
    slug: SlugField(unique)
    parent: FK(self, nullable)  # tree structure
    sort_order: IntegerField(default=0)
    is_active: BooleanField(default=True)

class EquipmentModel(TimestampMixin, UUIDMixin):
    """設備類型 (e.g., 'Robe MegaPointe')"""
    category: FK(EquipmentCategory, PROTECT)
    name: CharField(255)
    brand: CharField(255, blank)
    model_number: CharField(255, blank)
    description: TextField(blank)
    is_numbered: BooleanField(default=True)
    total_quantity: PositiveIntegerField(default=0)  # 無編號設備用
    image: ImageField(nullable)
    custom_fields: JSONField(default=dict)  # GIN indexed
    is_active: BooleanField(default=True)
    # Indexes: (category, is_active), GIN(custom_fields)

class EquipmentItem(TimestampMixin, UUIDMixin):
    """個別設備實體 (僅限有編號設備)"""
    class OwnershipType: OWNED / RENTED_IN
    class Status:
        PENDING_RECEIPT = "pending_receipt"    # 已登記但尚未實際到貨（僅租入設備）
        AVAILABLE = "available"               # 在庫
        OUT = "out"                           # 不在庫（原因看 CheckoutRecord 關聯的 schedule type）
        RESERVED = "reserved"                 # 被預留（排程已確認但還沒出庫）
        LOST = "lost"                         # 遺失
        RETIRED = "retired"                   # 報廢（terminal）
        RETURNED_TO_VENDOR = "returned_to_vendor"  # 租入設備已歸還供應商（terminal）

    equipment_model: FK(EquipmentModel, PROTECT)
    serial_number: CharField(255, unique)
    internal_id: CharField(100, blank)  # 公司內部編號
    ownership_type: CharField(default=OWNED)
    rental_agreement: FK(RentalAgreement, PROTECT, nullable)
    current_status: CharField(default=AVAILABLE)  # denormalized cache
    lamp_hours: PositiveIntegerField(default=0)
    purchase_date: DateField(nullable)
    warranty_expiry: DateField(nullable)
    notes: TextField(blank)
    custom_fields: JSONField(default=dict)  # GIN indexed
    is_active: BooleanField(default=True)
    # Constraints: rental_agreement_consistency CHECK
    # Indexes: (equipment_model, current_status), (current_status), GIN(custom_fields)

class EquipmentStatusLog(TimestampMixin):
    """Append-only event log — SINGLE SOURCE OF TRUTH for equipment status"""
    class Action:
        # Physical warehouse actions (always paired with WarehouseTransaction)
        CHECK_OUT = "check_out"     # 設備離開倉庫
        CHECK_IN = "check_in"       # 設備回到倉庫
        # Transfer action (no warehouse involved)
        TRANSFER = "transfer"       # 直接從 Schedule A 移轉到 Schedule B（status 不變，仍為 "out"）
        # Asset lifecycle actions (not warehouse operations)
        REGISTER = "register"       # 新設備入帳（購買或租入）— from_status="" (空字串，設備之前不存在)
        DEREGISTER = "deregister"   # 設備銷帳（報廢或租入歸還供應商）
        # Planning actions
        RESERVE = "reserve"         # 預留（排程確認時）
        UNRESERVE = "unreserve"     # 取消預留
        # Special actions
        MARK_LOST = "mark_lost"
        MARK_RETIRED = "mark_retired"
        RECONCILE = "reconcile"     # 系統每日調和修正

    equipment_item: FK(EquipmentItem, CASCADE)
    action: CharField(30)
    from_status: CharField(30)
    to_status: CharField(30)
    # Context FKs — 依 action 類型設定
    schedule: FK(Schedule, SET_NULL, nullable)              # CHECK_OUT/CHECK_IN 的目標排程; TRANSFER 的目的地排程
    rental_agreement: FK(RentalAgreement, SET_NULL, nullable)
    warehouse_transaction: FK(WarehouseTransaction, SET_NULL, nullable)
    equipment_transfer: FK(EquipmentTransfer, SET_NULL, nullable)  # for TRANSFER actions
    performed_by: FK(User, PROTECT)
    performed_at: DateTimeField(auto_now_add)
    notes: TextField(blank)
    # Indexes: (equipment_item, -performed_at)

class FaultRecord(TimestampMixin, UUIDMixin):
    equipment_item: FK(EquipmentItem, CASCADE)
    reported_by: FK(User, SET_NULL, nullable)
    title: CharField(255)
    description: TextField
    severity: CharField (low/medium/high/critical)
    is_resolved: BooleanField(default=False)
    resolved_at: DateTimeField(nullable)
    resolved_by: FK(User, nullable)
    resolution_notes: TextField(blank)
```

#### 故障顯示規則

設備在以下場景需即時顯示未解決故障數量與摘要：

| 場景 | 顯示方式 |
|------|---------|
| 設備列表（Equipment Browser） | 有未解決故障的設備顯示 badge + 故障數量，可點擊展開 |
| 設備詳情頁 | 故障 tab 列出所有故障，未解決的置頂 |
| 器材選擇器（EquipmentSelector） | 序號選取器中有故障的設備顯示警告圖標 + tooltip 說明 |
| 倉庫視圖 | 在庫設備如有未解決故障，加 badge 提醒 |

**API 支援**：設備列表 API 使用 annotation `active_fault_count = Count('faultrecord', filter=Q(faultrecord__is_resolved=False))`，避免 N+1 查詢。

> **關鍵設計**：`EquipmentModel` 代表設備類型，`EquipmentItem` 代表個別實體。無編號設備（如線材）只用 `EquipmentModel.total_quantity`，不建立 EquipmentItem rows。

> **無編號設備的限制**：無編號設備不支援 EquipmentStatusLog（無法追蹤個別狀態），其庫存透過 `total_quantity` + CheckoutRecord 的 `quantity`/`quantity_returned`/`quantity_transferred` 計算。`total_quantity` 變更時自動建立 `AuditLog(action=QUANTITY_CHANGE, changes={"old": N, "new": M})`，保留完整增減紀錄。

> **統一出入庫模型**：設備不管是去活動、送修、外租，物理動作都是 CHECK_OUT/CHECK_IN，差別在關聯的 Schedule type。設備的「顯示狀態」（活動中/維修中/外租中）不是存在 current_status 裡，而是從 active CheckoutRecord 的 schedule type 推導。

> **狀態正確性保障**：所有狀態變更必須經過 `EquipmentStatusService.transition()`，使用 `SELECT FOR UPDATE` 確保原子性。`current_status` 是 cache，`EquipmentStatusLog` 是 truth。定期 reconciliation 任務驗證一致性。

#### Display Status 推導邏輯

```python
def get_display_status(item: EquipmentItem) -> str:
    """推導設備的顯示狀態（給 UI 用）"""
    if item.current_status == "pending_receipt":
        return "pending_receipt"
    if item.current_status == "available":
        return "in_warehouse"
    if item.current_status == "reserved":
        return "reserved"
    if item.current_status == "out":
        # 從 active CheckoutRecord 找出原因
        active_record = CheckoutRecord.objects.filter(
            equipment_item=item,
            checked_in_at__isnull=True,
            transferred_at__isnull=True,
        ).select_related('schedule_equipment__schedule').first()
        if active_record:
            schedule_type = active_record.schedule_equipment.schedule.schedule_type
            return {"event": "in_event", "external_repair": "in_repair",
                    "rental_out": "rented_out"}[schedule_type]
        return "out_unknown"  # shouldn't happen, flag for reconciliation
    return item.current_status  # lost, retired, returned_to_vendor
```

---

### custom_fields app

```python
class CustomFieldDefinition(TimestampMixin):
    """自訂欄位定義 — 支援動態新增設備屬性"""
    class FieldType: TEXT / NUMBER / BOOLEAN / DATE / SELECT / MULTISELECT
    class EntityType: EQUIPMENT_MODEL / EQUIPMENT_ITEM

    name: CharField(100)
    slug: SlugField(100)  # JSON key
    field_type: CharField(20)
    entity_type: CharField(20)
    category: FK(EquipmentCategory, nullable)  # 可限定特定分類
    is_required: BooleanField(default=False)
    default_value: JSONField(nullable)
    description: TextField(blank)
    placeholder: CharField(200, blank)
    options: JSONField(nullable)  # for SELECT/MULTISELECT: [{"value":"dmx","label":"DMX"}]
    validation_rules: JSONField(nullable)  # e.g., {"min":0,"max":100}
    display_order: PositiveIntegerField(default=0)
    is_filterable: BooleanField(default=False)
    is_visible_in_list: BooleanField(default=False)
    is_active: BooleanField(default=True)
    # Unique: (slug, entity_type)
```

**Value storage**: JSONB 欄位在 `EquipmentModel.custom_fields` 和 `EquipmentItem.custom_fields`，key 為 slug。

**Frontend**: 取得 field definitions API → 動態渲染對應表單元件（TextInput, NumberInput, DatePicker, Select 等）。

**Filtering**: `is_filterable=True` 的欄位出現在篩選器，使用 PostgreSQL JSONB `@>` 查詢 + GIN index。

---

### schedules app

```python
class Schedule(TimestampMixin, UUIDMixin):
    """統一的檔期 model — 三種類型"""
    class ScheduleType: EVENT / EXTERNAL_REPAIR / RENTAL_OUT
    class Status: DRAFT / CONFIRMED / IN_PROGRESS / COMPLETED / CANCELLED

    schedule_type: CharField(20)
    status: CharField(20, default=DRAFT)
    title: CharField(255)
    contact_name: CharField(255, blank)  # DRAFT 可空，CONFIRMED 時必填
    contact_phone: CharField(20, blank)
    contact_email: EmailField(blank)
    start_datetime: DateTimeField
    end_datetime: DateTimeField
    expected_return_date: DateTimeField(nullable)  # for repair
    location: CharField(500, blank)
    notes: TextField(blank)
    created_by: FK(User, SET_NULL, nullable)
    parent: FK(self, CASCADE, nullable)  # dispatch events 層級結構

    # Status transition metadata
    confirmed_at: DateTimeField(nullable)
    confirmed_by: FK(User, nullable)
    started_at: DateTimeField(nullable)
    completed_at: DateTimeField(nullable)
    cancelled_at: DateTimeField(nullable)
    cancelled_by: FK(User, nullable)
    cancellation_reason: TextField(blank)

    has_conflicts: BooleanField(default=False)  # 任何器材超選時自動 True

    is_active: BooleanField(default=True)
    # Indexes: (schedule_type, status), (start_datetime, end_datetime), (parent)

    # --- Dispatch Events (子調度事件) ---
    # parent FK 建立層級關係。子調度事件的設計原則：
    # 1. 子事件 **不擁有自己的 ScheduleEquipment** — 共用父排程的器材池
    # 2. 子事件用途：時間軸標記、備註、人員調度等組織資訊
    # 3. 子事件 schedule_type 必須與父排程相同
    # 4. 子事件 start/end_datetime 必須在父排程時間範圍內
    # 5. 器材出庫/入庫/移轉都對應到父排程（parent），不對應子事件
    # 6. 子事件狀態跟隨父排程：父排程 CANCELLED → 子事件全部 CANCELLED
```

> **注意**：`rental_in` 不再是 Schedule type，而是獨立的 `RentalAgreement`（見 rentals app）。

#### Schedule Status State Machine

```
  ┌─────────┐   confirm   ┌───────────┐   begin (auto)   ┌─────────────┐   complete   ┌───────────┐
  │  DRAFT  │ ──────────> │ CONFIRMED │ ───────────────> │ IN_PROGRESS │ ──────────> │ COMPLETED │
  └─────────┘             └───────────┘                  └─────────────┘             └───────────┘
       │                       │                               │
       │ cancel                │ cancel                        │ cancel (force)
       v                       v                               v
  ┌───────────┐          ┌───────────┐                   ┌───────────┐
  │ CANCELLED │          │ CANCELLED │                   │ CANCELLED │
  └───────────┘          └───────────┘                   └───────────┘
       │                       │
       │ reopen (30d limit)    │ reopen
       v                       v
  ┌─────────┐            ┌─────────┐
  │  DRAFT  │            │  DRAFT  │
  └─────────┘            └─────────┘
```

| Transition | Trigger | Validations | Side Effects |
|------------|---------|-------------|--------------|
| DRAFT → CONFIRMED | 使用者手動 | 至少有一項設備、日期合理、聯絡人已填 | 建立軟預留、發送通知、記錄 StatusLog |
| CONFIRMED → IN_PROGRESS | **自動**：首筆設備 check out 時 | 至少一件設備已出庫 | 記錄 StatusLog |
| IN_PROGRESS → COMPLETED | 使用者確認（系統建議當所有設備歸還時） | 所有已出庫設備都已歸還 | 釋放所有 allocation、記錄 StatusLog |
| ANY → CANCELLED | 使用者手動 | IN_PROGRESS 需 force 或先歸還設備 | 釋放軟預留、已出庫設備建立回收任務、發送通知 |
| CANCELLED → DRAFT | 使用者手動（管理員） | 取消後 30 天內 | 清除取消欄位、設備需重新確認 |
| Date/time changed | 使用者編輯日期 | 狀態為 DRAFT/CONFIRMED | 自動重新執行衝突偵測：更新所有 ScheduleEquipment.is_over_allocated + Schedule.has_conflicts，發送 EQUIPMENT_CONFLICT 通知（如有新衝突） |

```python
class ScheduleStatusLog(TimestampMixin):
    schedule: FK(Schedule, CASCADE)
    from_status: CharField(20)
    to_status: CharField(20)
    changed_by: FK(User, PROTECT)
    changed_at: DateTimeField(auto_now_add)
    notes: TextField(blank)
```

---

```python
class ScheduleEquipment(TimestampMixin):
    """檔期器材配置 — 只存 quantity_planned，實際出入庫數量從 CheckoutRecord 計算"""
    schedule: FK(Schedule, CASCADE)
    equipment_model: FK(EquipmentModel, PROTECT)
    quantity_planned: PositiveIntegerField
    planned_items: M2M(EquipmentItem, blank=True)  # 可選：部分或全部指定具體序號
    is_over_allocated: BooleanField(default=False)  # 超選標記（需求 > 可用）
    over_allocation_note: TextField(blank)           # 超選原因/說明
    notes: TextField(blank)
    # Unique: (schedule, equipment_model)

    # COMPUTED properties (not stored):
    # quantity_checked_out → Count(checkout_records where checked_in_at IS NULL)
    # quantity_returned → Count(checkout_records where checked_in_at IS NOT NULL)
    # quantity_total_dispatched → Count(checkout_records)
    # quantity_pending → max(0, quantity_planned - quantity_total_dispatched)
    # quantity_specified → Count(planned_items)  # 已指定序號數量
    # quantity_unspecified → quantity_planned - quantity_specified  # 尚未指定序號

class CheckoutRecord(TimestampMixin):
    """SINGLE SOURCE OF TRUTH for equipment checkout/return — 同時支援有編號和無編號設備"""
    schedule_equipment: FK(ScheduleEquipment, CASCADE)

    # --- 設備識別 ---
    # 有編號：equipment_item 有值, quantity=1
    # 無編號：equipment_item=null, quantity=N（一筆 record 代表一批）
    equipment_item: FK(EquipmentItem, SET_NULL, nullable)
    quantity: PositiveIntegerField(default=1)

    checked_out_at: DateTimeField
    checked_out_by: FK(User, PROTECT)

    # --- Close reason 1: 歸還入庫 ---
    checked_in_at: DateTimeField(nullable)       # 全部歸還時填入
    checked_in_by: FK(User, nullable)
    quantity_returned: PositiveIntegerField(default=0)  # 無編號部分歸還用
    condition_on_return: CharField(20, blank)     # good / damaged / missing_parts
    return_notes: TextField(blank)

    # --- Close reason 2: 移轉至另一排程 ---
    transferred_at: DateTimeField(nullable)
    transfer: FK(EquipmentTransfer, SET_NULL, nullable)
    quantity_transferred: PositiveIntegerField(default=0)  # 無編號部分移轉用

    # --- Computed ---
    # 有編號: is_active = checked_in_at IS NULL AND transferred_at IS NULL
    # 無編號: quantity_still_out = quantity - quantity_returned - quantity_transferred
    #         is_fully_closed = (quantity_still_out == 0)，此時填入 checked_in_at

    # Constraints:
    # 有編號：UniqueConstraint(fields=["equipment_item"],
    #     condition=Q(equipment_item__isnull=False, checked_in_at__isnull=True, transferred_at__isnull=True),
    #     name="unique_active_checkout_per_item")
    # 無編號：CHECK(quantity_returned + quantity_transferred <= quantity)
```

**效能最佳化**：列表查詢使用 `ScheduleEquipment.objects.with_quantities()` annotated queryset，透過 Django `Count` + `filter` annotation 一次算出所有數量，避免 N+1。

**部分指定序號**：`quantity_planned=8` + `planned_items=[MP-001, MP-002, MP-003, MP-004]` → 已指定 4 台，剩餘 4 台出庫時才選。適用場景：關鍵設備提前預留，其餘彈性調配。

---

### Equipment Planning & Availability (規劃層)

> **核心概念**：系統區分「物理層」和「規劃層」。物理層 = `current_status`（設備現在在哪）；規劃層 = `ScheduleEquipment`（設備未來被規劃去哪）。規劃時的即時可用性查詢屬於規劃層。

#### 可用性計算邏輯

```python
def get_availability(equipment_model, time_range, exclude_schedule=None):
    """計算某型號設備在某時段的可用數量"""

    # 1. 自有可調度數量（排除 lost/retired/returned_to_vendor）
    if equipment_model.is_numbered:
        total_owned = equipment_model.items.filter(
            ownership_type="owned", is_active=True,
            current_status__in=["available", "reserved", "out"]
        ).count()
    else:
        total_owned = equipment_model.total_quantity

    # 2. 租入已到貨數量（current_status 不再是 pending_receipt，可實際調度）
    if equipment_model.is_numbered:
        rental_received = equipment_model.items.filter(
            ownership_type="rented_in", is_active=True,
            current_status__in=["available", "reserved", "out"]
        ).count()
    else:
        rental_received = 0  # 無編號租入暫不支援

    total_dispatchable = total_owned + rental_received

    # 3. 同時段已佔用數量（考慮移轉時間點的正確計算）
    allocated = get_transfer_aware_allocation(
        equipment_model, time_range, exclude_schedule
    )

    # 4. 租入待到貨數量（pending_receipt 的 EquipmentItem，在此時間範圍內合約仍有效）
    pending_rental_in = equipment_model.items.filter(
        ownership_type="rented_in", is_active=True,
        current_status="pending_receipt",
        rental_agreement__end_date__gte=time_range.start,
    ).count()

    confirmed_available = total_dispatchable - allocated

    return {
        "total_owned": total_owned,
        "rental_received": rental_received,            # 租入已到貨（可調度）
        "total_dispatchable": total_dispatchable,      # 總可調度 = 自有 + 租入已到貨
        "allocated_by_others": allocated,
        "confirmed_available": confirmed_available,    # 確定可用 = 總可調度 - 已佔用
        "pending_rental_in": pending_rental_in,        # 租入待到貨（pending_receipt 的 item 數）
        "projected_available": confirmed_available + pending_rental_in,  # 預估可用
    }
```

#### 有編號設備 — 個別可用性

```python
def get_item_availability(equipment_model, time_range):
    """查詢有編號設備在某時段的逐台可用性"""
    items = equipment_model.items.filter(is_active=True).exclude(
        current_status__in=["retired", "returned_to_vendor"]
    )

    # 找出同時段被其他排程指定的 items
    occupied_item_ids = ScheduleEquipment.objects.filter(
        equipment_model=equipment_model,
        schedule__start_datetime__lt=time_range.end,
        schedule__end_datetime__gt=time_range.start,
        schedule__status__in=["confirmed", "in_progress"],
    ).values_list('planned_items__id', flat=True)

    # 也包含已出庫且該時段內不會歸還的 items
    checked_out_ids = CheckoutRecord.objects.filter(
        schedule_equipment__equipment_model=equipment_model,
        checked_in_at__isnull=True,
    ).values_list('equipment_item_id', flat=True)

    result = []
    for item in items:
        if item.id in occupied_item_ids:
            # 找出佔用此 item 的排程
            occupying = ScheduleEquipment.objects.filter(
                planned_items=item,
                schedule__start_datetime__lt=time_range.end,
                schedule__end_datetime__gt=time_range.start,
            ).select_related('schedule').first()
            result.append({
                "item": item,
                "available": False,
                "reason": "scheduled",
                "occupied_by": occupying.schedule if occupying else None,
            })
        elif item.id in checked_out_ids:
            result.append({"item": item, "available": False, "reason": "checked_out"})
        elif item.current_status == "lost":
            result.append({"item": item, "available": False, "reason": "lost"})
        else:
            result.append({"item": item, "available": True})

    return result
```

#### 超選（Over-allocation）處理

規劃時的衝突偵測是**軟約束**——警告但允許覆寫：

```
使用者規劃器材 → 系統即時顯示可用數量
  ├── 需求 ≤ 可用 → 正常儲存 ✅
  └── 需求 > 可用 → 超選警告
       ├── 使用者可填寫「超選原因」
       ├── ScheduleEquipment.is_over_allocated = True
       ├── Schedule.has_conflicts = True（任一器材超選即觸發）
       ├── UI 紅字標記 + 排程列表警告 badge
       └── 發送 EQUIPMENT_CONFLICT 通知給 can_manage_schedules 權限使用者
```

#### 移轉對可用性計算的影響（Transfer-Aware Allocation）

移轉改變設備在不同 schedule 之間的歸屬時間。可用性計算必須考慮移轉時間點：

```python
def get_transfer_aware_allocation(equipment_model, time_range, exclude_schedule=None):
    """計算考慮移轉後的正確佔用量 — 取時段內的 peak 值"""

    # 1. 收集所有相關排程的基礎分配
    base_allocations = ScheduleEquipment.objects.filter(
        equipment_model=equipment_model,
        schedule__start_datetime__lt=time_range.end,
        schedule__end_datetime__gt=time_range.start,
        schedule__status__in=["confirmed", "in_progress"],
    )
    if exclude_schedule:
        base_allocations = base_allocations.exclude(schedule=exclude_schedule)

    # 2. 收集所有相關移轉（PLANNED/CONFIRMED，未取消）
    relevant_transfers = TransferLineItem.objects.filter(
        equipment_model=equipment_model,
        transfer__status__in=["planned", "confirmed"],
        transfer__planned_datetime__gt=time_range.start,
        transfer__planned_datetime__lt=time_range.end,
    ).select_related('transfer')

    # 3. 建立時間分割點
    time_points = sorted(set(
        [time_range.start, time_range.end] +
        [t.transfer.planned_datetime for t in relevant_transfers]
    ))

    # 4. 計算每個時段的佔用量，取 peak
    peak_allocated = 0
    for i in range(len(time_points) - 1):
        segment_start = time_points[i]
        segment_end = time_points[i + 1]
        segment_total = 0

        for alloc in base_allocations:
            sched = alloc.schedule
            if sched.start_datetime < segment_end and sched.end_datetime > segment_start:
                effective_qty = alloc.quantity_planned

                # 扣除在此時段之前已移出的數量
                outgoing = relevant_transfers.filter(
                    transfer__from_schedule=sched,
                    transfer__planned_datetime__lte=segment_start,
                )
                for t in outgoing:
                    effective_qty -= t.quantity

                # 加上在此時段之前已移入的數量
                incoming = relevant_transfers.filter(
                    transfer__to_schedule=sched,
                    transfer__planned_datetime__lte=segment_start,
                )
                for t in incoming:
                    effective_qty += t.quantity

                segment_total += max(0, effective_qty)

        peak_allocated = max(peak_allocated, segment_total)

    return peak_allocated
```

**範例**：
```
Event A: 3/1-3/3, 8 台 MegaPointe
Event B: 3/3-3/5, 4 台 MegaPointe
Transfer: 3/3 移轉 4 台 A→B

查詢 3/1-3/5 可用性:
  時段 3/1-3/3: A=8, B=4（移轉未發生，B 的 4 台來自其他來源或自行規劃）
  時段 3/3-3/5: A=8-4=4, B=4（移轉已發生，A 減少 4 台）
  peak = max(8+4, 4+4) = 12 或 8，取決於 B 的 4 台是否由移轉提供

如果 B 的 quantity_planned 就是預期從 A 移轉來的:
  時段 3/1-3/3: A=8, B=4-4(incoming not yet)=0 → total=8
  時段 3/3-3/5: A=8-4=4, B=0+4(incoming)=4 → total=8
  peak = 8 ✅ 正確！不會重複計算
```

> **關鍵**：destination schedule 的 `quantity_planned` 應包含預期從移轉收到的數量，可用性計算會在移轉時間點之前自動扣除尚未到達的移轉量。

超選不會阻止儲存，但會在以下位置持續提醒：
- 排程列表：衝突排程有 ⚠️ badge
- 排程詳情：超選器材紅字 + 不足數量
- Dashboard attention items：列出所有有衝突的排程
- Timeline view：衝突時段紅色高亮

#### 不足時的快速租賃流程

器材選擇器內嵌 Quick Create Rental：

```
[規劃器材] → 需要 8 台 MegaPointe，只有 6 台
  → 顯示 "⚠ 不足 2 台"
  → [建立租賃合約] 按鈕（inline）
     → Quick Create Modal:
        ├── 供應商名稱: [________]
        ├── 型號: MegaPointe（自動帶入）
        ├── 數量: [2]（自動帶入不足數）
        ├── 租期: [開始日] - [結束日]（從排程帶入）
        └── [建立草稿] → 建立 RentalAgreement(DRAFT) + RentalAgreementLine
  → 建立後：
     ├── 排程可先存為 DRAFT
     ├── 器材選擇器顯示 "預期租入 +2 台"
     └── 待租入設備實際到貨後，回來編輯排程即可看到足夠數量
```

Quick Create 只建立租約草稿（供應商 + 型號 + 數量 + 租期），詳細資訊（合約編號、聯絡方式等）稍後到租賃管理頁補齊。

#### Availability API

```
GET /equipment/models/{uuid}/availability/?start=...&end=...
Response: {
    "equipment_model": {...},
    "total_owned": 8,
    "rental_received": 2,
    "total_dispatchable": 10,
    "allocated_by_others": 6,
    "confirmed_available": 4,
    "pending_rental_in": 0,
    "projected_available": 4
}

GET /equipment/models/{uuid}/items/availability/?start=...&end=...
Response: {
    "items": [
        {"uuid": "...", "serial_number": "MP-001", "available": true},
        {"uuid": "...", "serial_number": "MP-002", "available": false,
         "reason": "scheduled", "occupied_by": {"title": "某演唱會", "uuid": "..."}}
    ]
}

POST /schedules/check-availability/
Body: {
    "start_datetime": "2026-03-01T08:00",
    "end_datetime": "2026-03-03T22:00",
    "exclude_schedule": "uuid-of-current-schedule",  # 編輯時排除自己
    "equipment": [
        {"equipment_model_uuid": "...", "quantity": 8},
        {"equipment_model_uuid": "...", "quantity": 50}
    ]
}
Response: {
    "results": [
        {
            "equipment_model": {"uuid": "...", "name": "MegaPointe"},
            "requested": 8,
            "confirmed_available": 6,
            "projected_available": 6,
            "is_sufficient": false,
            "shortage": 2,
            "conflicting_schedules": [
                {"uuid": "...", "title": "某婚禮", "planned": 4, "period": "3/1-3/2"}
            ]
        },
        {
            "equipment_model": {"uuid": "...", "name": "XLR Cable 10m"},
            "requested": 50,
            "confirmed_available": 120,
            "is_sufficient": true
        }
    ],
    "has_any_conflict": true
}
```

---

### rentals app (租入設備)

> **核心概念**：租入設備 ≠ Schedule type。租入的設備一旦進入系統，就如同自有設備一樣運作 — 可指派到活動、出庫、甚至再租出去。唯一差別是它有歸還期限，且生命週期有「資產登記/註銷」。

```python
class RentalAgreement(TimestampMixin, UUIDMixin):
    """租入合約"""
    class Status: DRAFT / ACTIVE / RETURNING / COMPLETED / CANCELLED

    vendor_name: CharField(255)
    vendor_contact: CharField(255, blank)
    vendor_phone: CharField(20, blank)
    agreement_number: CharField(50, unique)
    status: CharField(20, default=DRAFT)
    start_date: DateTimeField
    end_date: DateTimeField  # 合約歸還期限
    notes: TextField(blank)
    created_by: FK(User, PROTECT)

class RentalAgreementLine(TimestampMixin):
    """租約明細 — 定義租什麼型號、幾台"""
    agreement: FK(RentalAgreement, CASCADE)
    equipment_model: FK(EquipmentModel, PROTECT)
    quantity: PositiveIntegerField
    notes: TextField(blank)
    # Unique: (agreement, equipment_model)
```

#### 租入設備完整生命週期

```
Phase 1: 建立合約 + 資產登記      Phase 2: 物理接收             Phase 3: 正常使用              Phase 4: 歸還
─────────────────────────      ──────────────────           ──────────────────            ──────────────────
RentalAgreement + EquipmentItem  2a: 入庫 (CHECK_IN)          如同自有設備                    出庫 + 資產註銷
(DRAFT → ACTIVE)                 2b: 直接部署 (CHECK_OUT)      (CHECK_OUT/CHECK_IN/TRANSFER)  (CHECK_OUT + DEREGISTER)
status: pending_receipt          → available / out
```

**Phase 1 — 建立合約 + 資產登記**
1. 建立 `RentalAgreement`（status=DRAFT）
2. 加入 `RentalAgreementLine`（MegaPointe ×4, Cable ×20 等）
3. 為每台設備建立 `EquipmentItem`：
   - `ownership_type = "rented_in"`, `rental_agreement = this`
   - `current_status = "pending_receipt"`
   - 填入序號、內部編號等資訊
4. 系統寫入 `EquipmentStatusLog(action=REGISTER, to_status=pending_receipt)`
5. 確認合約 → status=ACTIVE
6. **設備此時已存在系統中**，可在規劃層被選取（帶「待到貨」標記），但不可出庫

**Phase 2a — 物理接收 → 入庫（預設）**
1. 使用者在 UI 確認哪些設備已到貨
2. `EquipmentItem.current_status: pending_receipt → available`
3. 系統建立 `WarehouseTransaction(type=CHECK_IN, rental_agreement=this)`
4. 系統寫入 `EquipmentStatusLog(action=CHECK_IN, pending_receipt → available)`
5. 設備進入倉庫，可被出庫

**Phase 2b — 物理接收 → 直接部署到排程（跳過倉庫，僅限租入設備）**

> **僅限租入設備**：自有設備初始狀態一定是 available（已在倉庫），不存在從外部直接部署。

1. 使用者選擇「直接部署到排程」，選擇目標排程
2. `EquipmentItem.current_status: pending_receipt → out`
3. 系統建立 `WarehouseTransaction(type=CHECK_OUT, schedule=target)`（注意：只設 schedule FK，不設 rental_agreement，以遵守 mutual exclusivity constraint。租入 context 由 `EquipmentItem.rental_agreement` 推導）
4. 建立 `CheckoutRecord` for 目標排程的 ScheduleEquipment
5. 系統寫入 `EquipmentStatusLog(action=CHECK_OUT, pending_receipt → out, schedule=target)`

> **State machine 不變**：`pending_receipt → available`（接收入庫）和 `pending_receipt → out`（直接部署）都是合法轉換。

**Phase 3 — 正常使用（完全等同自有設備）**
- 可被分配到活動 → CHECK_OUT（關聯 Schedule）
- 可從活動回來 → CHECK_IN（關聯 Schedule）
- 可被再租出去 → CHECK_OUT（關聯 Schedule type=RENTAL_OUT）
- 可被送修 → CHECK_OUT（關聯 Schedule type=EXTERNAL_REPAIR）
- 可被移轉 → TRANSFER（從 Schedule A 直接到 Schedule B，不回倉庫）
- UI 上有「租入」標籤 + 歸還倒數（綠色→黃色→紅色）

**Phase 4 — 歸還供應商（出庫 + 資產註銷）**
- **前提**：該設備必須是 `current_status = "available"`（在倉庫裡）
- 如果設備還在外面（活動中/維修中），系統阻止歸還並提示先入庫
1. 使用者在 UI 選擇要歸還的設備
2. 系統建立 `WarehouseTransaction(type=CHECK_OUT, rental_agreement=this)`
3. 系統寫入 `EquipmentStatusLog(action=CHECK_OUT)` + `EquipmentStatusLog(action=DEREGISTER)`
4. `EquipmentItem.current_status = "returned_to_vendor"`, `is_active = False`
5. 所有設備歸還後 → `RentalAgreement.status = "completed"`

#### 邊界情況

| 情境 | 處理方式 |
|------|---------|
| 租期到了但設備在活動中 | **不自動處理**，產生高優先級告警（RENTAL_EXPIRING），讓人決定延長租約或安排回收 |
| 租期到了設備在維修中 | 同上，告警通知 |
| 部分設備歸還 | 支援分批歸還，agreement status=RETURNING 直到全部歸還完 status=COMPLETED |
| 租入設備損壞 | 正常走 FaultRecord 流程，歸還時 condition_on_return 可記錄狀態 |
| 租約取消（pending_receipt 設備）| DEREGISTER 所有 pending_receipt 的 EquipmentItem（is_active=False），移除它們在 ScheduleEquipment.planned_items 中的關聯，重新計算受影響排程的衝突偵測 |
| 租約取消（已接收設備）| 已接收的設備（available/out）不自動處理，系統產生告警要求人工處理（先入庫再歸還供應商），agreement status 改為 CANCELLED 但保留設備記錄 |

---

### warehouse app

> **核心概念**：WarehouseTransaction 是所有設備物理移動的唯一紀錄。不管設備去活動、送修、外租，還是租入設備的收發，都通過這個 model 記錄。

```python
class WarehouseTransaction(TimestampMixin, UUIDMixin):
    """出入倉交易批次 — 所有物理移動的唯一紀錄"""
    class TransactionType: CHECK_OUT / CHECK_IN
    class Status: PENDING_CONFIRMATION / CONFIRMED / CANCELLED

    transaction_type: CharField(10)
    status: CharField(25, default=CONFIRMED)

    # 原因（以下兩個 FK 擇一，或都為 null 表示 ad-hoc 操作）
    schedule: FK(Schedule, SET_NULL, nullable)              # 活動/送修/外租
    rental_agreement: FK(RentalAgreement, SET_NULL, nullable)  # 租入設備收發

    performed_by: FK(User, PROTECT)
    confirmed_by: FK(User, SET_NULL, nullable)
    confirmed_at: DateTimeField(nullable)
    notes: TextField(blank)

    # Constraints: CHECK(NOT (schedule IS NOT NULL AND rental_agreement IS NOT NULL))
    #              i.e. schedule and rental_agreement are mutually exclusive

class TransactionLineItem(TimestampMixin):
    transaction: FK(WarehouseTransaction, CASCADE)
    equipment_model: FK(EquipmentModel, PROTECT)
    equipment_item: FK(EquipmentItem, SET_NULL, nullable)  # 有編號
    quantity: PositiveIntegerField(default=1)  # 無編號
    notes: TextField(blank)
```

#### 統一出入庫 UI Flow

**所有場景共用同一套 UI**，差別只在選擇「原因」：

```
[出庫作業]
  1. 選擇原因：
     ├── 選一個 Schedule（活動/送修/外租）→ 系統帶入該排程規劃的設備
     ├── 選一個 RentalAgreement → 系統帶入待歸還的租入設備
     └── 手動選取（ad-hoc，不關聯任何排程）
  2. 確認/調整要出庫的設備清單
  3. 提交 → 建立 WarehouseTransaction + 更新設備狀態

[入庫作業]
  1. 選擇來源：
     ├── 選一個 Schedule → 系統帶入已出庫未歸還的設備
     ├── 選一個 RentalAgreement → 系統帶入待接收的租入設備
     └── 從「目前在外設備」列表選取
  2. 勾選實際歸還的設備
  3. 提交 → 建立 WarehouseTransaction + 更新設備狀態
```

#### 雙人確認流程

1. User A（`requires_confirmation=True`）執行出庫
2. 系統建立 `WarehouseTransaction(status=PENDING_CONFIRMATION)`
3. **設備狀態此時尚未變更**
4. 發送通知給有 `can_check_out` 權限的使用者
5. User B 確認 → status=CONFIRMED → 設備狀態才變更
6. 如取消 → status=CANCELLED → 無任何變更

#### Side Effects（確認後自動觸發）

| 操作 | Side Effect |
|------|-------------|
| CHECK_OUT + Schedule | EquipmentItem.current_status → "out", 建立 CheckoutRecord, Schedule auto → IN_PROGRESS（如果首筆出庫） |
| CHECK_IN + Schedule | EquipmentItem.current_status → "available", CheckoutRecord.checked_in_at 填入, Schedule auto → COMPLETED（如果全部歸還）, **condition_on_return == "damaged" → 自動建立 FaultRecord（severity=medium, title 自動生成）+ FAULT_REPORTED 通知** |
| CHECK_IN + RentalAgreement（接收入庫）| pending_receipt → available, CHECK_IN 寫入 StatusLog |
| CHECK_OUT + Schedule（租入直接部署）| pending_receipt → out, CHECK_OUT 寫入 StatusLog, 建立 CheckoutRecord（租入 context 由 EquipmentItem.rental_agreement 推導） |
| CHECK_OUT + RentalAgreement（歸還供應商）| EquipmentItem → returned_to_vendor + is_active=False, CHECK_OUT + DEREGISTER 寫入 StatusLog |

---

### transfers app (器材移轉)

> **核心概念**：設備從一個 Schedule 直接移轉到另一個 Schedule，不經過倉庫。移轉時 `current_status` 維持 `"out"` 不變，改變的是設備關聯的 Schedule context。

```python
class EquipmentTransfer(TimestampMixin, UUIDMixin):
    """Schedule 之間的器材直接移轉（不經倉庫）"""
    class Status: PLANNED / CONFIRMED / CANCELLED

    from_schedule: FK(Schedule, PROTECT, related_name="outgoing_transfers")
    to_schedule: FK(Schedule, PROTECT, related_name="incoming_transfers")

    status: CharField(20, default=PLANNED)
    planned_datetime: DateTimeField
    executed_at: DateTimeField(nullable)

    performed_by: FK(User, SET_NULL, nullable)
    confirmed_by: FK(User, SET_NULL, nullable)
    confirmed_at: DateTimeField(nullable)
    notes: TextField(blank)
    created_by: FK(User, PROTECT)

class TransferLineItem(TimestampMixin):
    transfer: FK(EquipmentTransfer, CASCADE)
    equipment_model: FK(EquipmentModel, PROTECT)
    equipment_item: FK(EquipmentItem, SET_NULL, nullable)  # 有編號
    quantity: PositiveIntegerField(default=1)               # 無編號
    notes: TextField(blank)
```

#### 移轉 Side Effects（CONFIRMED 後觸發）

| Step | 動作 |
|------|------|
| 1 | 關閉 from_schedule 的 `CheckoutRecord`（`transferred_at` 填入, `transfer` 填入） |
| 2 | 建立 to_schedule 的新 `CheckoutRecord`（checked_out_at = now） |
| 3 | `EquipmentStatusLog(action=TRANSFER, from_status="out", to_status="out", schedule=to_schedule, equipment_transfer=this)` |
| 4 | `current_status` 不變，維持 `"out"` |
| 5 | 若 to_schedule 無對應 `ScheduleEquipment` → 自動建立 |
| 6 | 若 from_schedule 所有設備都已歸還或移轉 → 建議 COMPLETED |

#### 移轉驗證規則

| 規則 | 驗證 |
|------|------|
| from_schedule 狀態 | 必須為 IN_PROGRESS（設備已出庫才能移轉） |
| to_schedule 狀態 | 必須為 DRAFT / CONFIRMED / IN_PROGRESS（不可移轉到 COMPLETED / CANCELLED） |
| 設備存在性 | 移轉的設備必須在 from_schedule 有 active CheckoutRecord |
| 不可自移轉 | from_schedule ≠ to_schedule |

#### 移轉權限

- 建立/執行移轉需要 `can_check_out` 權限（移轉本質上是「從 A 出庫 + 入 B」）
- 確認移轉需要 `can_check_in` 權限
- 取消移轉需要 `can_manage_schedules` 權限

#### 移轉與雙人確認

- 如果 `performed_by.requires_confirmation` → `status=PLANNED`（等待確認）
- 確認前設備狀態不變，CheckoutRecord 不變
- 確認後才觸發 side effects

#### 移轉使用場景

```
場景 1: 活動結束部分器材直接去另一場活動
  活動A 詳情 → 器材 Tab → 選擇 MegaPointe ×4 → [移轉到] → 選擇 活動B → 確認

場景 2: 活動進行中部分器材送修
  活動A 詳情 → 器材 Tab → 選擇 故障的 MP-003 → [移轉到] → 選擇 "維修中心" (type=REPAIR) → 確認

場景 3: 外租結束部分器材直接去另一場外租
  外租A 詳情 → 器材 Tab → 選擇全部 → [移轉到] → 選擇 外租B → 確認
```

#### 移轉 UI

```
┌─ 建立移轉 ────────────────────────────────────────┐
│                                                    │
│ 來源: 演唱會A（3/1-3/3）                             │
│ 目的地: [搜尋排程...                          ▼]    │
│         ├── 婚禮B (3/3-3/5)                        │
│         ├── 維修中心 (3/4-3/10) [REPAIR]            │
│         └── [+ 新建排程]                            │
│                                                    │
│ 選擇要移轉的器材（從已出庫清單中選）:                    │
│ ☑ MegaPointe    MP-001, MP-002, MP-003, MP-004     │
│ ☑ XLR Cable     ×20 條                             │
│ ☐ MAC Viper     (不移轉)                            │
│                                                    │
│ 計畫移轉時間: [2026/03/03 22:00]                     │
│ 備註: [活動結束後直接送去婚禮現場]                      │
│                                                    │
│        [取消]  [規劃移轉]  [立即執行]                  │
└────────────────────────────────────────────────────┘
```

---

### notifications app

```python
class Notification(TimestampMixin, UUIDMixin):
    class NotificationType: UPCOMING_EVENT / EQUIPMENT_DUE_RETURN / REPAIR_COMPLETED /
                            PENDING_CONFIRMATION / SCHEDULE_CHANGED / FAULT_REPORTED /
                            RENTAL_EXPIRING / EQUIPMENT_TRANSFERRED / EQUIPMENT_CONFLICT /
                            SYSTEM
    recipient: FK(User, CASCADE)
    notification_type: CharField(30)
    title: CharField(255)
    message: TextField
    is_read: BooleanField(default=False)
    read_at: DateTimeField(nullable)
    related_object_type: CharField(50, blank)
    related_object_uuid: UUIDField(nullable)
    email_sent: BooleanField(default=False)
    email_sent_at: DateTimeField(nullable)

class NotificationEventType(Model):
    """通知事件類型 (seed data)"""
    id: CharField(50, PK)  # e.g., 'upcoming_event'
    label: CharField(100)
    description: TextField
    category: CharField(50)  # 'schedule', 'equipment', 'rental'
    sort_order: IntegerField

class NotificationChannel(Model):
    """通知管道 (seed data)"""
    id: CharField(20, PK)  # 'in_app', 'email', 'push'(future), 'line'(future)
    label: CharField(50)
    is_enabled: BooleanField(default=True)  # 全域開關
    sort_order: IntegerField

class UserNotificationPreference(TimestampMixin):
    """使用者通知偏好 — event_type × channel 矩陣"""
    user: FK(User, CASCADE)
    event_type: FK(NotificationEventType)
    channel: FK(NotificationChannel)
    is_enabled: BooleanField(default=True)
    # Unique: (user, event_type, channel)
```

**通知發送邏輯**：
1. 事件觸發 → `NotificationService.send(user, event_type, payload)`
2. 取得所有啟用的 channel
3. 對每個 channel 檢查 `UserNotificationPreference`
4. 如有 preference 且 enabled → dispatch to channel handler
5. 如無 preference record → 使用 default（in_app=True, email=依事件類型）

**Default preferences for new users**:
- 所有事件 × in_app = enabled
- Critical events（upcoming_event, equipment_due_return, pending_confirmation, fault_reported, rental_expiring）× email = enabled
- Non-critical events（schedule_changed, repair_completed）× email = disabled

---

### audit app

```python
class AuditLog(TimestampMixin):
    """不可變更的操作紀錄"""
    class ActionType: CREATE / UPDATE / DELETE / CHECK_OUT / CHECK_IN /
                      CONFIRM / STATUS_CHANGE / QUANTITY_CHANGE
    user: FK(User, SET_NULL, nullable)
    action: CharField(20)
    model_name: CharField(100)
    object_uuid: UUIDField
    object_repr: CharField(500)
    changes: JSONField(default=dict)  # old/new values
    ip_address: GenericIPAddressField(nullable)
    user_agent: TextField(blank)
```

---

## Equipment Status Correctness Guarantee

### Hybrid Strategy: Event Sourcing + Denormalized Cache

```
Truth:        EquipmentStatusLog (append-only event log)
Cache:        EquipmentItem.current_status (denormalized, always updated atomically)
Display:      current_status + CheckoutRecord's schedule type → 顯示狀態
Safety Net:   Periodic reconciliation task (daily)
```

### current_status vs Display Status

`current_status` 共 7 種：

| current_status | 意義 | Terminal? |
|---------------|------|-----------|
| `pending_receipt` | 已登記但尚未到貨（僅租入設備） | No |
| `available` | 在倉庫中 | No |
| `out` | 不在倉庫中 | No |
| `reserved` | 被預留（尚未出庫） | No |
| `lost` | 遺失 | No (可找回) |
| `retired` | 報廢 | Yes |
| `returned_to_vendor` | 租入設備已歸還 | Yes |

前端顯示用 **Display Status** 從 `out` 再細分：

| Display Status | 來源 | UI 顯示 |
|---------------|------|---------|
| `pending_receipt` | current_status == pending_receipt | 待到貨（租入） |
| `in_warehouse` | current_status == available | 在庫 |
| `reserved` | current_status == reserved | 已預留 |
| `in_event` | out + Schedule(type=EVENT) | 活動中：{活動名稱} |
| `in_repair` | out + Schedule(type=EXTERNAL_REPAIR) | 維修中：{維修商} |
| `rented_out` | out + Schedule(type=RENTAL_OUT) | 外租中：{租借對象} |
| `lost` | current_status == lost | 遺失 |
| `retired` | current_status == retired | 已報廢 |
| `returning_to_vendor` | out + RentalAgreement | 歸還供應商中 |

### 所有狀態變更的唯一入口

```python
class EquipmentStatusService:
    VALID_TRANSITIONS = {
        "pending_receipt": ["available", "out"],  # 接收入庫 / 直接部署
        "available": ["out", "reserved", "lost", "retired", "returned_to_vendor"],
        "reserved":  ["available", "out"],
        "out":       ["available", "out"],  # available=入庫歸還, out=TRANSFER（context 改變但 status 不變）
        "lost":      ["available"],
        # retired, returned_to_vendor: terminal — no transitions out
    }

    @staticmethod
    def transition(item, action, target_status, user,
                   schedule=None, rental_agreement=None,
                   warehouse_transaction=None, equipment_transfer=None, notes=""):
        with transaction.atomic():
            locked = EquipmentItem.objects.select_for_update().get(pk=item.pk)
            from_status = locked.current_status
            if target_status not in VALID_TRANSITIONS.get(from_status, []):
                raise InvalidTransitionError(from_status, target_status)
            locked.current_status = target_status
            locked.save(update_fields=["current_status", "updated_at"])
            EquipmentStatusLog.objects.create(
                equipment_item=locked, action=action,
                from_status=from_status, to_status=target_status,
                schedule=schedule, rental_agreement=rental_agreement,
                warehouse_transaction=warehouse_transaction,
                equipment_transfer=equipment_transfer,
                performed_by=user, notes=notes,
            )

    @staticmethod
    def transfer(item, from_schedule, to_schedule, transfer, user, notes=""):
        """專用移轉方法 — status 不變（out→out），但 context 改變"""
        with transaction.atomic():
            locked = EquipmentItem.objects.select_for_update().get(pk=item.pk)
            if locked.current_status != "out":
                raise InvalidTransitionError(locked.current_status, "out",
                    "Transfer requires item to be in 'out' status")
            # status 不變，只記錄 context 變更
            EquipmentStatusLog.objects.create(
                equipment_item=locked, action="transfer",
                from_status="out", to_status="out",
                schedule=to_schedule,  # 記錄目的地排程
                equipment_transfer=transfer,
                performed_by=user, notes=notes,
            )
```

### Race Condition 防護

- **Pessimistic locking** (`SELECT FOR UPDATE`)：短暫持有 row-level lock，UX 不受影響
- **UniqueConstraint**：`unique_active_checkout_per_item` 確保同一設備不會被兩人同時 checkout
- **DB-level CHECK constraint**：`rental_agreement_consistency` 確保 ownership_type 和 rental_agreement 一致

### Reconciliation

Celery Beat 每日凌晨執行：
1. 比對 `current_status` 與最新 `EquipmentStatusLog.to_status`，修正差異
2. 檢查 `current_status == "out"` 但沒有對應的 active CheckoutRecord 的設備
3. 檢查 CONFIRMED 的 EquipmentTransfer：`transferred_at` 已填但 to_schedule 沒有對應的新 CheckoutRecord
4. 檢查無編號設備的數量一致性：`total_quantity` ≥ Σ(active CheckoutRecords 的 quantity_still_out)
5. 檢查 `pending_receipt` 設備的租約狀態是否仍有效（避免租約已取消但設備未清理）
6. 修正差異並通知管理員

---

## API Design (REST, `/api/v1/`)

### Auth
```
POST /auth/login/                        POST /auth/logout/
POST /auth/token/refresh/                GET|PATCH /auth/me/
POST /auth/change-password/
```

### Users (admin)
```
GET|POST /users/
GET|PATCH|DELETE /users/{uuid}/
PATCH /users/{uuid}/permissions/
```

### Equipment
```
CRUD /equipment/categories/                             # tree structure
CRUD /equipment/models/
GET  /equipment/models/{uuid}/availability/?start=&end=
CRUD /equipment/items/
GET  /equipment/items/{uuid}/history/
POST /equipment/items/{uuid}/fault/
GET  /equipment/faults/?severity=&is_resolved=&equipment_item=
GET  /equipment/faults/{uuid}/
PATCH /equipment/faults/{uuid}/                               # update fault details
POST /equipment/faults/{uuid}/resolve/                        # mark as resolved (sets is_resolved, resolved_at, resolved_by)
GET  /equipment/inventory/                              # summary
GET  /equipment/inventory/by-status/
POST /equipment/batch-import/                           # CSV import
```

### Custom Fields
```
CRUD /custom-fields/definitions/?entity_type=&category=
```

### Schedules
```
CRUD /schedules/?type=&status=&start=&end=
CRUD /schedules/{uuid}/equipment/
CRUD /schedules/{uuid}/dispatches/                      # child dispatch events
POST /schedules/{uuid}/confirm/
POST /schedules/{uuid}/complete/
POST /schedules/{uuid}/cancel/
POST /schedules/{uuid}/reopen/
POST /schedules/check-availability/
GET  /schedules/{uuid}/export/excel?include_serial_detail=false
```

### Rentals (租入)
```
CRUD /rentals/agreements/
CRUD /rentals/agreements/{uuid}/lines/
POST /rentals/agreements/{uuid}/activate/
POST /rentals/agreements/{uuid}/receive/              # Phase 2: 物理接收（body 含 deploy_to 可選直接部署）
POST /rentals/agreements/{uuid}/return/               # Phase 4: 歸還 → CHECK_OUT + 註銷 EquipmentItem
GET  /rentals/agreements/{uuid}/equipment/             # 查看此合約的所有設備及狀態
POST /rentals/agreements/{uuid}/extend/                # 延長租期
```

**Receive API 擴展**:
```
POST /rentals/agreements/{uuid}/receive/
Body: {
    "items": ["item-uuid-1", "item-uuid-2"],   # 確認接收的設備
    "deploy_to": "schedule-uuid" | null         # null=入庫(預設), uuid=直接部署到排程
}
```

### Warehouse
```
POST /warehouse/check-out/
POST /warehouse/check-in/
GET  /warehouse/transactions/
GET  /warehouse/transactions/{uuid}/
POST /warehouse/transactions/{uuid}/confirm/
GET  /warehouse/pending-confirmations/
```

### Transfers (移轉)
```
POST /transfers/                                       # 建立移轉（PLANNED 或立即 CONFIRMED）
GET  /transfers/?from_schedule=&to_schedule=&status=
GET  /transfers/{uuid}/
POST /transfers/{uuid}/execute/                        # 執行已規劃的移轉
POST /transfers/{uuid}/confirm/                        # 確認移轉（雙人確認）
POST /transfers/{uuid}/cancel/
GET  /schedules/{uuid}/transfers/                      # 某排程的所有移轉（含出/入）
```

### Notifications
```
GET  /notifications/
GET  /notifications/unread-count/
POST /notifications/{uuid}/read/
POST /notifications/mark-all-read/
GET  /notifications/preferences/                        # full matrix
PATCH /notifications/preferences/                       # single cell
POST /notifications/preferences/reset/
PATCH /notifications/preferences/bulk/                  # full column
```

### Dashboard
```
GET /dashboard/stats/                                   # status breakdown counts
GET /dashboard/upcoming-schedules/?days=7
GET /dashboard/attention-items/                         # 需處理項目
GET /dashboard/recent-activity/?limit=20
```

### Timeline
```
GET /timeline/?start=&end=&category=
GET /timeline/conflicts/?start=&end=
```

### Equipment Templates
```
CRUD /equipment/templates/
GET  /equipment/recent-selections/?limit=5
```

### Audit
```
GET /audit/logs/?model_name=&object_uuid=&user=
```

---

## Frontend Routing

```
/login

/ (Overview Dashboard)
/warehouse                        → 在庫設備
/events                           → 活動列表（依狀態分 tab）
/events/create                    → 建立活動
/events/:uuid                     → 活動詳情 + 設備配置
/rentals-out                      → 外租管理
/rentals-in                       → 租入管理
/repairs                          → 維修看板（Kanban）
/equipment                        → 設備資料庫 (全設備)
/equipment/categories             → 分類管理
/equipment/models/:uuid           → 設備類型詳情
/equipment/items/:uuid            → 個別設備詳情 + 完整歷史
/equipment/inventory              → 庫存概覽
/timeline                         → 時間軸 / Gantt view

/warehouse/check-out              → 出倉操作
/warehouse/check-in               → 入倉操作
/warehouse/transactions           → 交易歷史
/warehouse/pending                → 待確認操作

/notifications                    → 通知列表
/settings                         → 系統設定
/settings/notifications           → 通知偏好（矩陣）
/settings/custom-fields           → 自訂欄位管理
/admin/users                      → 使用者管理
/admin/audit-logs                 → 操作紀錄
```

---

## Dashboard Views 詳細設計

### View 1: Overview Dashboard (`/`)

**Status Breakdown Cards (頂部 4~6 張可點擊卡片)**:

| 卡片 | 數據 | 點擊跳轉 |
|------|------|----------|
| 倉庫中 | 在庫數量 + 本週入庫數 | `/warehouse` |
| 活動中 | 出庫數量 + 進行中場數 | `/events?status=in_progress` |
| 外租中 | 出租數量 + 即將到期數 | `/rentals-out` |
| 維修中 | 維修數量 + 待取回數 | `/repairs` |
| 需注意 | 逾期+故障+燈泡警告數 | 展開下方 attention items |
| 總設備 | 總數 + 較上月變化 | `/equipment` |

**Upcoming Schedules (未來 7 天)**:
- 每行：日期、活動名稱、狀態 badge、設備件數
- 可展開看簡要設備清單、點擊進入詳情

**Equipment Requiring Attention (需處理項目)**:
- 按嚴重程度排序：逾期未歸還(紅) > 故障回報(橙) > 維護提醒(黃)
- 每行有 inline action button（催還、查看、排程維護）

**Recent Activity Feed**:
- 最近倉庫操作紀錄，infinite scroll
- 格式：時間 + 操作者 + 動作 + 目標 + 設備數量

**Quick Actions (快速操作按鈕)**:
- `[+ 新增排程]` `[出庫作業]` `[入庫作業]` `[回報故障]`

**Mobile**: 卡片 2×3 grid、各區塊可收合、Quick actions 為 FAB

---

### View 2: Warehouse View (`/warehouse`)

- 三種顯示模式：**分類群組 (預設)** / 表格 / 卡片
- **分類群組**：每個分類可展開/收合，顯示該分類下每個型號的在庫數/總數/可用率
- **表格**：完整欄位含序號、型號、品牌、Serial No.、狀態、燈泡時數等
- **卡片**：設備圖片 + 型號 + 編號 + 狀態 badge
- 搜尋：即時搜尋（name / serial / brand），debounced
- 篩選：分類 + 品牌 + 狀態 + 自訂欄位，可組合
- 批次操作：多選 checkbox + Shift 範圍選取
- Mobile: 預設卡片模式 2 欄 grid，篩選用底部 sheet

---

### View 3: Events View (`/events`)

- 狀態 tab（全部/規劃中/已確認/進行中/已完成），每 tab 有 badge count
- 卡片式列表：活動名稱、日期、場地、設備概要、出庫進度條
- 可展開設備清單（含 `[匯出料單]` `[複製清單]` `[編輯設備]`）
- 操作按鈕：查看設備、出庫作業、編輯排程
- Mobile: 卡片全寬、操作收進 "..." 選單

---

### View 4: Rental Out View (`/rentals-out`)

- 逾期項目置頂紅色高亮
- 卡片顯示：租借對象、日期範圍、設備清單
- 操作：催還通知、延期、標記歸還
- 統計卡片：出租中數量、逾期數

---

### View 5: Repair View (`/repairs`)

- **Kanban 看板 (預設)**：待送修(DRAFT/CONFIRMED) / 維修中(IN_PROGRESS) / 已完成(COMPLETED)，卡片可拖放
- **列表模式**：表格，含設備、問題、維修商、狀態
- 已完成可一鍵 "歸還入庫"
- Mobile: 水平可滑動 tab，每 tab 內垂直列表

---

### View 6: Equipment Browser (`/equipment`)

- 完整設備資料庫，含所有狀態設備
- 表格為主：每欄可排序、可自訂顯示欄位（column picker）
- 多選批次操作：改狀態、排入維修、匯出
- 支援批次匯入（CSV）
- URL query params 同步篩選狀態（可分享）
- Mobile: 卡片列表取代表格

---

### View 7: Timeline View (`/timeline`)

**雙層級 Gantt Chart**：

**Layer 1 — 型號層級（預設）**
```
          3/1     3/2     3/3     3/4     3/5
MegaPointe (8台)  可用:2
  ███████████████████████                      ← 演唱會A (6台) [CONFIRMED]
            ████████████████████████████████   ← 婚禮B (4台) [CONFIRMED]
            ⚠ 衝突：需10台/有8台

XLR Cable (200條)  可用:50
  ███████████████████████                      ← 演唱會A (100)
            ████████████████████████████████   ← 婚禮B (50)  ✅
```

**Layer 2 — 個別設備（點擊型號展開）**
```
MegaPointe (8台)  [▼ 收合]
  MP-001  ███████████████████████                ← 演唱會A
  MP-002  ███████████████████████                ← 演唱會A
  ...
  MP-007              ████████████████████████   ← 婚禮B
  MP-008              ████████████████████████   ← 婚禮B
  🔴 未指定 ×2                                    ← 婚禮B 還差2台
```

**功能**：
- 時間刻度切換：週 / 月 / 季
- **Draft 顯示切換**：Toggle 按鈕，開啟時 Draft 排程以虛線/半透明顯示，不計入衝突偵測的「已確認佔用」但提供視覺參考
- 衝突高亮：同一型號時間重疊且數量超過 → 紅色背景 + ⚠️ 圖標
- Hover tooltip：排程名稱、狀態、設備數量、負責人
- 點擊 bar → 跳到排程詳情
- 顏色區分排程狀態：CONFIRMED=藍、IN_PROGRESS=綠、DRAFT=灰虛線
- 顏色區分排程類型：EVENT=藍、REPAIR=橙、RENTAL_OUT=紫
- Mobile: 改為 agenda-style 垂直列表（按日期分組）

---

### View 8: Equipment Detail View (`/equipment/items/:uuid`)

**Header**: 設備名稱 + 編號 + Serial No. + 狀態 + 操作按鈕（編輯、報修、停用）

**Tabs**:
1. **概覽**：燈泡時數進度條、使用統計（參與場次、維修次數、累積使用天數）
2. **活動歷程**：日期、活動名稱、角色、備註（infinite scroll）
3. **維修紀錄**：問題、維修商、處理天數
4. **故障紀錄**：每次回報含照片上傳
5. **排程**：未來已排定使用此設備的排程

---

## Equipment Selector 設計

### 設計原則

從「漏斗式多層下鑽」改為「**搜尋優先 + 扁平分類 + 購物車**」模式。目標：大多數操作 2-3 次點擊完成。

### Layout

**Desktop**:
```
┌────────────────────────────────────────────────────────────────────────────┐
│ 🔍 搜尋設備名稱、型號、序號、品牌...                 [從活動複製] [載入模板]  │
├──────────────────────────────────────────────┬─────────────────────────────┤
│                                              │ 已選設備 (3 類, 45 件)       │
│  [Moving Heads] [LED Wash] [Speakers] ...    │                             │
│                                              │ ▸ Moving Heads (32)         │
│  ── Moving Heads ──────────────────────      │   MegaPointe ×24            │
│                                              │   MAC Viper ×8              │
│  Robe MegaPointe          在庫: 28/32       │                             │
│  [  ────────────────○ 24 ]      [選序號]     │ ▸ LED Wash (8)              │
│                                              │                             │
│  MAC Viper Profile        在庫: 20/24       │                             │
│  [  ────────○ 8 ]               [選序號]     │ [清空] [儲存為模板] [確認]    │
└──────────────────────────────────────────────┴─────────────────────────────┘
```

**Mobile**:
```
┌────────────────────────────────┐
│ 🔍 搜尋設備...       [⋮ 更多]   │
│ [MH] [Wash] [Conv] [Spk] [→]  │  ← 水平可滑動 category chips
├────────────────────────────────┤
│ Robe MegaPointe    在庫: 28   │
│ [ ─────────○ 24 ]  [選序號]   │
│ MAC Viper Profile  在庫: 20   │
│ [ ───○ 8 ]         [選序號]   │
├────────────────────────────────┤
│ 已選 45 件 (3 類)    [▲ 展開]   │  ← 固定底部 bar
│              [確認選取]         │
└────────────────────────────────┘
```

### 6 種入口方式

| 方式 | 操作 | 適用場景 |
|------|------|---------|
| **Search** | 搜尋框打字，即時顯示結果，拖 slider 設數量 | 知道要什麼設備 |
| **Browse** | 點分類 chip → 該分類型號列表 → slider 設數量 | 瀏覽選擇 |
| **Range Select** | 點 "選序號" → 輸入 #1-32 範圍 → 自動跳過不可用 | 大量有編號設備 |
| **Copy from Event** | 選擇一個活動 → 複製其設備清單（可選含序號或僅型號數量） | 類似活動 |
| **Templates** | 載入預存模板，合併到 cart | 常見固定組合 |
| **Recent** | 顯示最近 5 次選取紀錄，一鍵加入 | 快速重複 |

### 序號選取器 (NumberedItemPicker)

```
┌─ Robe MegaPointe 序號選取 ─────────────────────────────┐
│ 快速範圍: [#__] 到 [#__]  [加入範圍]                     │
│                                                         │
│ [#1 ✓] [#2 ✓] [#3 ✓] ... [#7 🔧] ... [#15 📋] [#16 📋] │
│ 圖例: ✓ 在庫可用  📋 已排程  🔧 維修中  📤 出租中           │
│ 已選: 24 件 (#1-6, #8-14, #17-28)                       │
│                                    [取消]  [確認 24 件]   │
└─────────────────────────────────────────────────────────┘
```

- Shift+Click 範圍選取（Desktop）
- 不可用項目灰色 + tooltip 說明原因
- 自動跳過不可用

### State Management

使用 `useReducer` + Context：

```typescript
interface EquipmentSelection {
  equipmentModelId: string;
  modelName: string;
  category: string;
  quantity: number;
  isNumbered: boolean;
  selectedSerialNumbers: string[];
  availableCount: number;
}

// selections: Map<equipmentModelId, EquipmentSelection>
// Cart 是 selections 的視覺化呈現
```

---

## Excel Export (料單匯出)

### 格式

**Sheet 1: 設備清單**

```
                    設 備 清 單
活動名稱: 五月天演唱會 Day 2
活動日期: 2026/02/14 - 2026/02/16
場地: 台北小巨蛋 | 負責人: 張三
─────────────────────────────────────────────────
分類      │ 型號             │ 品牌   │ 數量 │ 序號      │ 備註 │ 勾選
Moving    │ Robe MegaPointe  │ Robe  │  24 │ #1-24    │      │ ☐
Head      │ MAC Viper Profile│ MA    │   8 │ #1-8     │      │ ☐
LED Wash  │ MAC Aura XB      │ MA    │  16 │ #1-16    │      │ ☐
Cable     │ DMX Cable 10m    │ -     │  20 │ -        │      │ ☐
─────────────────────────────────────────────────
                               合計:   142
出庫人簽名: ________    入庫人簽名: ________    日期: ________
```

**Sheet 2: 序號明細 (可選)**
- 逐一列出每台設備的 Serial No.，含出庫/入庫勾選欄

### 技術實作

- Backend: `openpyxl` 產生 .xlsx
- API: `GET /schedules/{uuid}/export/excel?include_serial_detail=false`
- Response: `StreamingResponse` + `Content-Disposition: attachment`
- Frontend: 點擊 `[匯出料單]` → loading spinner → 自動下載
- 匯出按鈕位置：活動卡片展開後 + 活動詳情頁設備 tab

---

## Notification Preferences UI

### Desktop: 矩陣表格

```
                          站內通知   Email   推播(即將推出)  LINE(即將推出)
排程相關
  即將到來的活動             [●]      [●]     [○] disabled  [○] disabled
  排程變更                  [●]      [○]     [○] disabled  [○] disabled
  待確認排程                [●]      [●]     [○] disabled  [○] disabled
設備相關
  設備歸還提醒              [●]      [●]     ...
  故障回報                  [●]      [●]
  維修完成                  [●]      [○]
租借相關
  租借即將到期              [●]      [●]

[恢復預設值]                                             [儲存變更]
```

### Mobile: Accordion

```
▾ 排程相關
  即將到來的活動:  站內 [●]  Email [●]
  排程變更:       站內 [●]  Email [○]
  ...
▸ 設備相關
▸ 租借相關
```

每個 toggle 使用 optimistic update（即時切換 + 背景 PATCH）。

---

## Permission System

### Attribute-based Flags on User Model

| Flag | Controls |
|------|----------|
| `can_check_in` | 入庫操作 |
| `can_check_out` | 出庫操作 |
| `requires_confirmation` | 此使用者的操作需另一人確認 |
| `can_manage_equipment` | 設備 CRUD（讀取所有人都可以） |
| `can_manage_schedules` | 排程 CRUD |
| `can_manage_users` | 使用者管理 |
| `can_view_reports` | Dashboard / 報表 |

### Backend: Custom DRF Permission Classes

```python
class CanCheckOut(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.can_check_out
```

### Frontend: `usePermission()` Hook

```typescript
const { canCheckOut, canManageUsers, requiresConfirmation } = usePermission();
// 控制 UI 可見性與按鈕 disabled 狀態
```

---

## Docker Compose

### Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| db | postgres:16-alpine | 5432 | 主資料庫 |
| redis | redis:7-alpine | 6379 | Celery broker + cache |
| backend | Django (gunicorn prod) | 8000 | API server |
| celery-worker | Same as backend | - | 非同步任務 |
| celery-beat | Same as backend | - | 定期任務排程 |
| frontend | Vite dev / Nginx prod | 5173/80 | 前端 |
| nginx (prod) | nginx:alpine | 80, 443 | Reverse proxy + SSL |

### Backup

- 每日 cron: `pg_dump | gzip > /backups/sms_YYYYMMDD.sql.gz`
- 保留 30 天

---

## Implementation Phases

### Progress Overview

| Phase | 名稱 | 狀態 | 備註 |
|-------|------|------|------|
| 1 | Foundation | ✅ Done | Django + React scaffold, auth, permissions |
| 2 | Equipment Management | ✅ Done | Full CRUD + inventory + custom fields |
| 3 | Schedule Management | ✅ Done | State machine, equipment allocation, availability |
| 4 | Warehouse, Transfers & Rentals | ✅ Done | Full CRUD + services + dual-person confirmation |
| 5 | Notifications & Audit Trail | ✅ Done | 簡化版：基本通知 + 審計日誌（偏好系統/定時任務留 Phase 8） |
| 6 | Core UX Completion | 🔲 TODO | 出入庫操作頁、移轉完善、使用者管理 |
| 7 | Dashboard, Timeline & Export | 🔲 TODO | 完整 Dashboard、Gantt 時間軸、Excel 匯出 |
| 8 | Advanced Notifications | 🔲 TODO | 偏好矩陣、多管道、Celery 定時任務、Reconciliation |
| 9 | Equipment Utilities | 🔲 TODO | 模板、CSV 匯入、維修 Kanban |
| 10 | Polish & Production | 🔲 TODO | 效能、mobile、DevOps、CI/CD |

---

### Phase 1: Foundation (Week 1-2) ✅

**Backend**:
- ✅ Django project scaffold + modular settings (base/dev/prod)
- ✅ Docker Compose dev environment (db + redis + backend)
- ✅ Custom User model + Organization model
- ✅ JWT auth (login, logout, refresh, me)
- ✅ Permission system (flags + DRF permission classes)
- ✅ Common base models (TimestampMixin, UUIDMixin)
- ✅ CORS config + API versioning

**Frontend**:
- ✅ Vite + React + TypeScript scaffold
- ✅ Tailwind CSS 4 + shadcn/ui setup
- ✅ Axios API client + auth interceptors + TanStack Query
- ✅ Login page + protected route layout (AppShell: Sidebar + TopBar)
- ✅ Basic routing structure
- ✅ Zustand UI store

**Deliverable**: 可登入、看到空 Dashboard with sidebar navigation

---

### Phase 2: Equipment Management (Week 3-4) ✅

**Backend**:
- ✅ EquipmentCategory CRUD (tree structure)
- ✅ EquipmentModel CRUD + custom_fields JSONB
- ✅ EquipmentItem CRUD + status management
- ✅ EquipmentStatusLog + EquipmentStatusService (with SELECT FOR UPDATE)
- ✅ CustomFieldDefinition CRUD + validation service
- ✅ FaultRecord CRUD
- ✅ Inventory endpoints (aggregation)
- ✅ Equipment availability check service
- ✅ Pagination + filtering (django-filter + JSONB filter)

**Frontend**:
- ✅ Equipment Browser page (table + card + grouped views)
- ✅ Equipment Detail page (tabs: overview, history, repairs, faults, schedules)
- ✅ Category management page
- ✅ Equipment creation/edit forms with dynamic custom fields
- ✅ Custom field management page (settings)
- ✅ Fault reporting form
- ✅ Inventory overview page

**Deliverable**: 完整設備 CRUD、自訂欄位、庫存檢視

---

### Phase 3: Schedule Management (Week 5-6) ✅

**Backend**:
- ✅ Schedule model + 三種類型 CRUD + status state machine
- ✅ ScheduleEquipment + annotated querysets (computed quantities)
- ✅ CheckoutRecord model
- ✅ Availability conflict detection service
- ✅ Dispatch events (child schedules)
- ⏳ Equipment templates CRUD → 移至 Phase 9
- ⏳ Excel export service (openpyxl) → 移至 Phase 7
- ✅ ScheduleStatusLog

**Frontend**:
- ✅ **EquipmentSelector component** (search, browse, range select)
- ✅ NumberedItemPicker component
- ✅ Schedule list page (status tabs)
- ✅ Schedule creation form (dynamic by type)
- ✅ Schedule detail page with equipment allocation
- ✅ Availability indicator + conflict warning UI
- ⏳ Timeline view (basic Gantt) → 移至 Phase 7
- ⏳ Excel export button + download flow → 移至 Phase 7

**Deliverable**: 建立活動/外租/送修並分配器材、衝突偵測

---

### Phase 4: Warehouse Operations, Transfers & Rentals (Week 7-8) ✅

**Backend**:
- ✅ WarehouseTransaction + TransactionLineItem
- ✅ Check-out service (atomic: create transaction → update item status → sync to schedule)
- ✅ Check-in service (reverse flow)
- ✅ Dual-person confirmation flow
- ✅ Auto-populate from schedule endpoint
- ✅ EquipmentTransfer + TransferLineItem CRUD
- ✅ Transfer execution service (close old CheckoutRecord, create new, log TRANSFER)
- ✅ RentalAgreement + RentalAgreementLine CRUD
- ✅ Rental receive service (入庫 or 直接部署 via deploy_to param)
- ✅ Rental return equipment service
- ⏳ Reconciliation Celery task → 移至 Phase 8

**Frontend**:
- ⏳ Check-out page → 移至 Phase 6（目前出入庫透過 API / 排程詳情頁操作）
- ⏳ Check-in page → 移至 Phase 6
- ⏳ Transfer creation modal → 移至 Phase 6
- ✅ Transfer list page
- ✅ Pending confirmations page + confirmation dialog
- ✅ Transaction history page
- ✅ Warehouse transaction detail page
- ✅ Rental-in management page (agreements list, detail, form)

**Deliverable**: 完整出入倉 + 移轉 + 雙人確認 + 租入租出管理（API 層完整，前端操作頁待 Phase 6）

---

### Phase 5: Notifications, Dashboard & Audit (Week 9-10) ✅

**Backend**:
- ✅ Notification model（簡化版：category + severity，無 event type 系統）
- ⏳ NotificationEventType + NotificationChannel models → 移至 Phase 8
- ⏳ UserNotificationPreference (matrix) → 移至 Phase 8
- ✅ Celery task: send_notification_email（含 retry）
- ⏳ Celery Beat periodic tasks → 移至 Phase 8
- ✅ NotificationService（trigger helpers for warehouse/schedule/fault/rental/transfer）
- ✅ AuditLog model + AuditService（含 IP 擷取、JSON changes）
- ✅ Dashboard summary endpoint（基本計數）
- ⏳ Dashboard 進階 endpoints → 移至 Phase 7

**Frontend**:
- ✅ Notification bell + unread count (30s polling)
- ✅ Notification dropdown (popover) + list page (含 category/read 過濾)
- ⏳ Notification preferences matrix page → 移至 Phase 8
- ✅ Audit log viewer (admin, 含 category/search 過濾 + entity links)
- ✅ Dashboard page（基本版：stat cards + quick actions）
- ⏳ Dashboard 完整版（upcoming, attention, activity feed）→ 移至 Phase 7

**Deliverable**: 基本通知系統 + 審計日誌 + Dashboard 基礎版（進階功能分散至 Phase 7-8）

---

### Phase 6: Core UX Completion — 出入庫操作頁、移轉完善、使用者管理 (Week 11-12)

> **目標**：填補核心操作流程的前端缺口。目前出入庫只能透過 API 或排程詳情頁觸發，缺少獨立的操作頁面；移轉只有列表頁；使用者管理無前端介面。

**Backend**:
- `GET /equipment/models/{uuid}/items/availability/?start=&end=` — 有編號設備逐台可用性查詢（支援序號選取器顯示佔用狀態）
- Transfer-aware availability 完整版：`get_transfer_aware_allocation()` 時間分割演算法，正確計算移轉前後的 peak 佔用量
- Users API 完善：`PATCH /users/{uuid}/permissions/` 權限批次更新端點

**Frontend**:
- **CheckOutPage** (`/warehouse/check-out`)：選擇原因（Schedule / RentalAgreement / 手動）→ 系統帶入規劃設備 → EquipmentSelector 調整 → 提交出庫
- **CheckInPage** (`/warehouse/check-in`)：選擇來源（Schedule / RentalAgreement / 在外設備列表）→ 勾選歸還設備 → 填寫 condition_on_return → 提交入庫
- **TransferFormPage** (`/transfers/new`)：選擇來源排程 → 選擇目的排程 → 從已出庫清單選設備 → 設定計畫移轉時間 → 規劃或立即執行
- **TransferDetailPage** (`/transfers/:uuid`)：移轉詳情 + 確認/取消操作按鈕
- **UserManagementPage** (`/admin/users`)：使用者列表 + 新增/編輯表單 + 權限 flag toggle

**Deliverable**: 完整的出入庫獨立操作流程、移轉 CRUD、使用者管理

---

### Phase 7: Dashboard Enhancement, Timeline & Excel Export (Week 13-14)

> **目標**：強化資料視覺化與報表能力。Dashboard 從基本計數升級為包含即時排程、待處理事項、活動 feed 的完整控制台；新增 Timeline Gantt 圖；支援料單 Excel 匯出。

**Backend**:
- `GET /dashboard/upcoming-schedules/?days=7` — 未來 N 天排程列表（含設備概要、出庫進度）
- `GET /dashboard/attention-items/` — 需處理項目（逾期未歸還、未解決故障、租約到期、待確認交易）
- `GET /dashboard/recent-activity/?limit=20` — 最近操作 feed（從 AuditLog 聚合）
- `GET /timeline/?start=&end=&category=` — 時間軸資料（型號層級佔用 + 排程區間 + 衝突標記）
- `GET /timeline/conflicts/?start=&end=` — 指定時段內的衝突排程
- ⏳ `GET /schedules/{uuid}/export/excel?include_serial_detail=false` — openpyxl 產生 .xlsx，StreamingResponse 下載（等待使用者提供範例格式後實作）

**Frontend**:
- **Dashboard 完整版**：Status Breakdown Cards（可點擊跳轉）、Upcoming Schedules（7 天）、Attention Items（按嚴重度排序 + inline action）、Recent Activity Feed、Quick Actions
- **TimelinePage** (`/timeline`)：雙層級 Gantt Chart
  - Layer 1：型號層級（每型號一列，顯示各排程佔用區間 + 可用餘量）
  - Layer 2：點擊展開個別設備分配
  - 時間刻度切換（週/月/季）、Draft 顯示 toggle、衝突紅色高亮、Hover tooltip
  - Mobile：改為 agenda-style 垂直列表（按日期分組）
- ⏳ **Excel 匯出按鈕**：等待使用者提供範例格式

**Deliverable**: 智慧化 Dashboard、設備時間軸（Excel 匯出待範例）

---

### Phase 8: Advanced Notifications & Periodic Tasks (Week 15-16)

> **目標**：將簡化版通知系統升級為 PLAN.md 設計的完整版——支援多管道、使用者偏好矩陣、定時提醒任務。

**Backend**:
- `NotificationEventType` model（seed data：UPCOMING_EVENT, EQUIPMENT_DUE_RETURN, REPAIR_COMPLETED, PENDING_CONFIRMATION, SCHEDULE_CHANGED, FAULT_REPORTED, RENTAL_EXPIRING, EQUIPMENT_TRANSFERRED, EQUIPMENT_CONFLICT, SYSTEM）
- `NotificationChannel` model（seed data：in_app, email；預留 push, line 為 disabled）
- `UserNotificationPreference` model（user × event_type × channel 矩陣）
- 通知偏好 API：
  - `GET /notifications/preferences/` — 完整矩陣（含 default fallback）
  - `PATCH /notifications/preferences/` — 單格切換
  - `PATCH /notifications/preferences/bulk/` — 整欄切換
  - `POST /notifications/preferences/reset/` — 恢復預設
- `NotificationService.send()` 升級：檢查 UserNotificationPreference → 依管道分發
- Default preferences for new users：in_app 全開、critical events email 開啟
- Celery Beat 定時任務：
  - `check_upcoming_events` — 每小時檢查未來 24h 內的 CONFIRMED 排程，通知負責人
  - `check_equipment_due_return` — 每日檢查出庫超過排程結束日的設備，通知 can_manage_schedules
  - `check_rental_expiring` — 每日檢查 7 天內到期的租約，通知相關使用者（severity 依剩餘天數遞增）
  - `reconcile_equipment_status` — 每日凌晨：比對 current_status 與 EquipmentStatusLog、檢查孤立 CheckoutRecord、驗證無編號數量一致性，修正差異並通知管理員

**Frontend**:
- **NotificationPreferencesPage** (`/settings/notifications`)：
  - Desktop：矩陣表格（列=事件類型按分類分組、欄=管道、儲存格=Toggle switch）
  - Mobile：Accordion 收合，每事件一行含管道 toggle
  - Optimistic update（即時切換 + 背景 PATCH）
  - 恢復預設按鈕

**Deliverable**: 完整通知偏好系統 + 自動化定時任務 + 每日狀態調和

---

### Phase 9: Equipment Utilities — Templates, Batch Import, Repair Kanban (Week 17-18)

> **目標**：提升設備管理效率的輔助功能——常用器材組合模板、CSV 批次匯入、維修看板。

**Backend**:
- `CRUD /equipment/templates/` — 設備模板（name, description, items: [{equipment_model, quantity}]）
- `GET /equipment/recent-selections/?limit=5` — 最近 5 次設備選取紀錄
- `POST /equipment/batch-import/` — CSV 批次匯入設備（解析、驗證、建立 EquipmentItem + EquipmentStatusLog(REGISTER)，回傳匯入結果摘要）
- 維修相關 API 擴展：
  - `GET /schedules/?type=external_repair&status=...` 已有，確認 filter 完善
  - 維修完成 → 自動建議歸還入庫

**Frontend**:
- **RepairKanbanPage** (`/repairs`)：
  - Kanban 看板：三欄（待送修 DRAFT/CONFIRMED → 維修中 IN_PROGRESS → 已完成 COMPLETED）
  - 卡片：設備名稱、問題描述、維修商、天數
  - 拖放切換狀態（desktop），Mobile 改為 tab + 垂直列表
  - 已完成可一鍵「歸還入庫」
- **EquipmentSelector 增強**：
  - 「從活動複製」模式：選擇一個排程 → 複製其設備清單
  - 「載入模板」模式：選擇預存模板 → 合併到 cart
  - 「最近選取」模式：最近 5 次紀錄一鍵加入
  - Quick Create Rental modal：器材不足時 inline 建立租賃草稿
- **CSV 匯入 UI**：設備管理頁新增「批次匯入」按鈕 → 上傳 CSV → 預覽 + 驗證結果 → 確認匯入

**Deliverable**: 設備模板、批次匯入、維修 Kanban、EquipmentSelector 完整六種入口

---

### Phase 10: Polish & Production (Week 19-20)

> **目標**：效能優化、全面 mobile 適配、生產環境部署。

**Backend**:
- Performance optimization（select_related, prefetch_related, query profiling）
- Production settings（security headers, HTTPS, logging）
- Database indexes review + EXPLAIN ANALYZE 驗證慢查詢
- API documentation（drf-spectacular / Swagger）完善
- Comprehensive test suite completion（前端 vitest + backend 補齊整合測試）
- Data seeding / fixtures for demo

**Frontend**:
- Mobile-first responsive polish across ALL pages
- Empty states for all lists
- Error boundary + global error handling
- Loading skeletons for all data-loading states
- Touch-friendly interactions for mobile（swipe, long-press）
- Production build optimization（code splitting, lazy routes）

**DevOps**:
- Production Docker Compose + Nginx + SSL（Let's Encrypt）
- PostgreSQL backup cron（每日 pg_dump → 保留 30 天）
- CI/CD pipeline（GitHub Actions: lint → test → build → deploy）
- Sentry error tracking
- Health check endpoints

**Deliverable**: Production-ready system deployed on VPS

---

### Future Phases (Post-Launch)

| Phase | Feature | 說明 |
|-------|---------|------|
| 11 | Barcode/QR code scanning | Camera API 掃描、標籤列印、快速出入庫 |
| 12 | Multi-tenant support | Organization-scoped querysets, tenant middleware |
| 13 | Push notifications | Firebase Cloud Messaging, service worker |
| 14 | Advanced reporting | Charts (recharts), PDF export, 設備使用率報表 |
| 15 | WebSocket real-time updates | Django Channels, 即時通知/狀態同步 |
| 16 | LINE notification channel | LINE Messaging API 整合 |

---

## Key Dependencies

### Backend (requirements/base.txt)
```
Django>=5.1,<5.2
djangorestframework>=3.15
djangorestframework-simplejwt>=5.3
django-cors-headers>=4.3
django-filter>=24.1
django-celery-beat>=2.6
celery[redis]>=5.4
redis>=5.0
psycopg[binary]>=3.1
drf-spectacular>=0.27
Pillow>=10.2
openpyxl>=3.1
gunicorn>=22.0
python-decouple>=3.8
dj-database-url>=2.1
```

### Frontend (package.json)
```
react, react-dom (^18.3)
react-router-dom (^7.0)
@tanstack/react-query (^5.50), @tanstack/react-table (^8.17)
zustand (^5.0), axios (^1.7)
react-hook-form (^7.52), @hookform/resolvers, zod (^3.23)
tailwindcss (^4.0), lucide-react, sonner, recharts
date-fns (^4.1)
```

### Dev
```
pytest, pytest-django, factory-boy (backend)
vitest, @testing-library/react, msw (frontend)
black, ruff (linting)
```

---

## Verification Plan

### Per-Phase Verification
1. **Backend**: `pytest` — models, services, views, permissions
2. **Frontend**: `vitest` + `@testing-library/react` — components, hooks
3. **Integration**: 透過前端 UI 手動走完主要流程
4. **Docker**: `docker compose up` 確認所有服務正常啟動
5. **Mobile**: Chrome DevTools device mode 驗證
6. **Production**: `docker compose -f docker-compose.prod.yml up`

### Key Test Scenarios
- 建立有編號器材 → 指定序號 → 分配到活動 → 出倉 → 入倉 → 確認狀態回到 available
- 建立兩個時間重疊活動 → 分配同一批器材 → 應偵測到衝突
- `requires_confirmation` 使用者出倉 → pending 狀態 → 另一人確認 → 設備狀態才變更
- 無編號器材（線材）出倉 50 條 → 庫存減少 → 入倉 50 條 → 庫存恢復
- 租入設備完整流程：建立合約（REGISTER → pending_receipt）→ 接收入庫（CHECK_IN → available）→ 分配到活動 → CHECK_OUT → CHECK_IN → 歸還供應商（CHECK_OUT + DEREGISTER）→ 狀態 returned_to_vendor + is_active=False
- 租入設備直接部署：建立合約（pending_receipt）→ 直接部署到排程（CHECK_OUT → out）→ 設備在活動中 → CHECK_IN → available
- 租入待到貨選取：建立合約 → 設備 pending_receipt → 規劃排程可選取此設備（帶待到貨標記）→ 出庫時阻止（尚未到貨）→ 到貨後才可出庫
- 租入設備到期：歸還期限到期 → 告警產生 → 延長租約 → 告警消失
- 租入設備到期但在外：設備在活動中 → 系統阻止歸還 → 告警提示先入庫
- Schedule 取消（已有設備出庫）→ 回收任務產生 → 設備入庫 → 狀態正確
- 自訂欄位：建立 Number 欄位 "Wattage" → 建立設備時填入值 → 篩選 Wattage > 400 → 正確回傳
- Excel 匯出：含序號明細 → 每台設備序號正確列出
- 通知偏好：關閉 email 的 schedule_changed → 排程變更時只收到站內通知不收 email
- 規劃可用性：8 台 MegaPointe，活動 A 佔 6 台(CONFIRMED) → 新活動同時段規劃 → 顯示可用 2 台
- 超選警告：規劃 4 台但只有 2 台可用 → 允許儲存但 is_over_allocated=True + 紅字 + 通知
- 部分指定序號：quantity_planned=8，指定 4 台序號 → quantity_specified=4, quantity_unspecified=4
- 規劃選擇租入待到貨器材：建立租約(DRAFT) → 規劃排程時 projected_available 含待到貨數量 → 可納入規劃
- 出庫驗證：規劃含租入待到貨設備 → 出庫時該設備尚未到貨 → 系統阻止出庫 → 到貨入庫後才可出庫
- Timeline 衝突視覺化：兩個 CONFIRMED 排程重疊 → 型號層 Gantt 顯示紅色衝突 → 展開看個別設備分配
- Timeline Draft 切換：Toggle Draft 顯示 → Draft 排程以虛線顯示 → 不計入衝突偵測
- Quick Create Rental：器材選擇器中點「建立租賃合約」→ 快速填入供應商+數量 → 建立 RentalAgreement(DRAFT)
- 移轉基本流程：活動A 出庫 4 台 MegaPointe → 移轉 2 台到活動B → A 的 CheckoutRecord 關閉(transferred) + B 的 CheckoutRecord 建立 → current_status 維持 "out" → Display status 從 "活動A" 變為 "活動B"
- 移轉到維修：活動進行中 MP-003 故障 → 移轉到維修排程 → Display status 變為 "維修中"
- 移轉雙人確認：requires_confirmation 使用者建立移轉 → status=PLANNED → 另一人確認 → 才觸發 side effects
- 移轉後活動完成：活動A 8台設備，4台入庫 + 4台移轉到活動B → 活動A 所有設備已處理 → 建議 COMPLETED
- Transfer-aware 可用性：活動A(3/1-3/3) 佔 8 台，活動B(3/3-3/5) 佔 4 台，移轉 4 台 A→B 於 3/3 → 查詢 3/1-3/5 peak 佔用 = 8（不是 12）
- 子調度事件：建立活動 → 新增子事件 → 子事件不可新增 ScheduleEquipment → 器材出庫對應父排程
- 日期變更重檢衝突：活動 A 佔 6 台 → 活動 B 佔 4 台（不衝突）→ 修改 B 日期使其與 A 重疊 → has_conflicts 自動更新 + EQUIPMENT_CONFLICT 通知
- 租約取消（待到貨）：租約有 pending_receipt 設備 → 取消租約 → 設備 DEREGISTER + is_active=False + 從排程 planned_items 移除 + 受影響排程重檢衝突
- 租約取消（已接收）：租約有 available 設備 → 取消租約 → 設備不自動處理 + 系統產生告警
- 移轉通知：移轉執行後 → from/to 排程的 created_by 收到 EQUIPMENT_TRANSFERRED 通知
- 損壞歸還自動建故障：入庫時 condition_on_return="damaged" → 自動建立 FaultRecord(severity=medium) + FAULT_REPORTED 通知
- 移轉驗證：嘗試移轉到 COMPLETED 排程 → 系統拒絕 + 錯誤訊息；嘗試移轉到 CANCELLED 排程 → 同拒絕
- 無編號數量追蹤：修改 EquipmentModel.total_quantity 從 200 → 180 → AuditLog 記錄 QUANTITY_CHANGE
- Reconciliation：手動修改 current_status 製造不一致 → 每日調和任務修正 + 通知管理員
- 故障回報與解決：回報故障 → FaultRecord 建立 → 設備列表顯示故障 badge → 標記解決（POST resolve）→ badge 消失
- DRAFT 無聯絡人：建立 Schedule(DRAFT) 不填 contact_name → 成功 → 嘗試 confirm → 失敗（要求填入聯絡人）
