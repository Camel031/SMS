# SMS - Stage Management System

A full-stack equipment inventory management system for stage production and AV professionals. Tracks equipment status across warehouses, schedules, and rentals with multi-user support and conflict detection.

## Features

- **Equipment Tracking** — monitor every item across warehouse / on-site / rented out / under repair
- **Schedule Management** — plan equipment allocation per event, detect over-allocation conflicts
- **Rental Agreements** — full lifecycle from contract creation to return, with pending-receipt support
- **Warehouse Operations** — batch check-in / check-out with optional dual-confirmation workflow
- **Equipment Transfers** — move items directly between active schedules without returning to warehouse
- **Custom Fields** — attach arbitrary typed metadata (text, number, date) to any equipment model
- **Notifications** — in-app and email notifications via Celery async tasks
- **Audit Log** — full change history on all critical entities
- **Timeline View** — Gantt-style visualization with conflict highlighting
- **Batch Import** — bulk equipment creation via CSV / Excel

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| UI | Tailwind CSS 4 + shadcn/ui |
| Server State | TanStack Query v5 |
| Client State | Zustand v5 |
| Forms | React Hook Form + Zod |
| Backend | Django 5.1 + Django REST Framework |
| Auth | JWT (SimpleJWT) |
| Database | PostgreSQL 16 |
| Task Queue | Celery + Redis |
| Deployment | Docker Compose + Nginx |

## Quick Start

```bash
git clone https://github.com/Camel031/SMS.git
cd SMS
cp .env.example .env
# Edit .env with your secrets
make up
make migrate
make createsuperuser
```

Frontend: http://localhost:5173 — Backend API: http://localhost:8000 — API Docs: http://localhost:8000/api/schema/swagger-ui/

## Make Commands

| Command | Description |
|---------|-------------|
| `make up` | Start all services |
| `make down` | Stop all services |
| `make build` | Rebuild Docker images |
| `make migrate` | Run database migrations |
| `make makemigrations` | Create new migration files |
| `make test-backend` | Run backend tests (pytest) |
| `make lint-backend` | Lint and format check (ruff) |
| `make format-backend` | Auto-format backend code |
| `make reset-db` | Drop and recreate database |
| `make logs` | Stream container logs |

## Project Structure

```
SMS/
├── backend/
│   ├── apps/
│   │   ├── accounts/        # Users, organizations, permissions
│   │   ├── equipment/       # Models, items, status logs, fault records
│   │   ├── schedules/       # Events, equipment allocation, checkout records
│   │   ├── rentals/         # Rental agreements and line items
│   │   ├── warehouse/       # Batch warehouse transactions
│   │   ├── transfers/       # Direct inter-schedule transfers
│   │   ├── notifications/   # Notification delivery and preferences
│   │   ├── audit/           # Change audit trail
│   │   ├── custom_fields/   # User-defined metadata fields
│   │   └── dashboard/       # Summary stats
│   └── config/              # Django settings (base / dev / prod)
├── frontend/
│   └── src/
│       ├── features/        # Page-level feature modules
│       ├── components/      # Shared UI components
│       ├── hooks/           # TanStack Query hooks
│       ├── stores/          # Zustand state
│       └── types/           # TypeScript type definitions
├── testdata/                # Sample import files
├── docker-compose.yml
├── docker-compose.prod.yml
└── Makefile
```

## License

MIT
