from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from apps.accounts.permissions import CanManageEquipment

from .models import CustomFieldDefinition
from .serializers import CustomFieldDefinitionSerializer


class CustomFieldDefinitionListCreateView(generics.ListCreateAPIView):
    serializer_class = CustomFieldDefinitionSerializer
    search_fields = ["name", "slug"]
    ordering_fields = ["name", "display_order", "created_at"]

    def get_queryset(self):
        qs = CustomFieldDefinition.objects.select_related("category")
        entity_type = self.request.query_params.get("entity_type")
        if entity_type:
            qs = qs.filter(entity_type=entity_type)
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category_id=category)
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == "true")
        return qs

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), CanManageEquipment()]
        return [IsAuthenticated()]


class CustomFieldDefinitionDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CustomFieldDefinitionSerializer
    lookup_field = "pk"

    def get_queryset(self):
        return CustomFieldDefinition.objects.select_related("category")

    def get_permissions(self):
        if self.request.method in ("PUT", "PATCH", "DELETE"):
            return [IsAuthenticated(), CanManageEquipment()]
        return [IsAuthenticated()]
