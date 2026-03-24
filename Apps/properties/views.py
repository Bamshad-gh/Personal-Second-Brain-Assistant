# Apps/properties/views.py
#
# CRUD views for PageTypeGroup, CustomPageType, PropertyDefinition, PropertyValue.
#
# Security model (same across all views):
#   - IsAuthenticated required on every endpoint
#   - Ownership verified via workspace__owner=request.user in every queryset
#   - NEVER return 403 — get_object_or_404 with owner check returns 404
#   - Django URL patterns use <uuid:pk> throughout
#
# Endpoint map:
#   GET/POST        /api/properties/groups/            PageTypeGroupListCreateView
#   PATCH/DELETE    /api/properties/groups/<pk>/       PageTypeGroupDetailView
#   GET/POST        /api/properties/custom-types/      CustomPageTypeListCreateView
#   GET/PATCH/DEL   /api/properties/custom-types/<pk>/ CustomPageTypeDetailView
#   GET/POST        /api/properties/definitions/       PropertyDefinitionListView
#   GET/PATCH/DEL   /api/properties/definitions/<pk>/  PropertyDefinitionDetailView
#   GET/POST        /api/properties/values/            PropertyValueListView
#   GET/PATCH/DEL   /api/properties/values/<pk>/       PropertyValueDetailView

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404

from Apps.workspaces.models import Workspace
from Apps.pages.models import Page
from .models import CustomPageType, PageTypeGroup, PropertyDefinition, PropertyValue
from .serializers import (
    CustomPageTypeSerializer,
    PageTypeGroupSerializer,
    PropertyDefinitionSerializer,
    PropertyValueSerializer,
)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Page Type Groups
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class PageTypeGroupListCreateView(APIView):
    """
    GET  /api/properties/groups/?workspace=<id>   → list groups for a workspace
    POST /api/properties/groups/                  → create a group
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = PageTypeGroup.objects.filter(
            workspace__owner=request.user,
            is_deleted=False,
        ).select_related('workspace')

        workspace_id = request.query_params.get('workspace')
        if workspace_id:
            qs = qs.filter(workspace_id=workspace_id)

        serializer = PageTypeGroupSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        workspace_id = request.data.get('workspace')
        get_object_or_404(Workspace, pk=workspace_id, owner=request.user, is_deleted=False)

        serializer = PageTypeGroupSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PageTypeGroupDetailView(APIView):
    """
    PATCH  /api/properties/groups/<pk>/  → update name, color, order
    DELETE /api/properties/groups/<pk>/  → soft delete; unlinks all its CustomPageTypes first
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        obj = get_object_or_404(
            PageTypeGroup, pk=pk,
            workspace__owner=request.user, is_deleted=False,
        )
        serializer = PageTypeGroupSerializer(obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        obj = get_object_or_404(
            PageTypeGroup, pk=pk,
            workspace__owner=request.user, is_deleted=False,
        )
        # Unlink all CustomPageTypes in this group so no orphaned FKs remain
        CustomPageType.objects.filter(group=obj).update(group=None)
        obj.is_deleted = True
        obj.save(update_fields=['is_deleted'])
        return Response(status=status.HTTP_204_NO_CONTENT)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Custom Page Types
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class CustomPageTypeListCreateView(APIView):
    """
    GET  /api/properties/custom-types/?workspace=<id>
    POST /api/properties/custom-types/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = CustomPageType.objects.filter(
            workspace__owner=request.user,
            is_deleted=False,
        ).select_related('workspace', 'group')

        workspace_id = request.query_params.get('workspace')
        if workspace_id:
            qs = qs.filter(workspace_id=workspace_id)

        serializer = CustomPageTypeSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        workspace_id = request.data.get('workspace')
        get_object_or_404(Workspace, pk=workspace_id, owner=request.user, is_deleted=False)

        serializer = CustomPageTypeSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CustomPageTypeDetailView(APIView):
    """
    GET    /api/properties/custom-types/<pk>/
    PATCH  /api/properties/custom-types/<pk>/
    DELETE /api/properties/custom-types/<pk>/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        obj = get_object_or_404(
            CustomPageType, pk=pk,
            workspace__owner=request.user, is_deleted=False,
        )
        return Response(CustomPageTypeSerializer(obj).data)

    def patch(self, request, pk):
        obj = get_object_or_404(
            CustomPageType, pk=pk,
            workspace__owner=request.user, is_deleted=False,
        )
        serializer = CustomPageTypeSerializer(obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        obj = get_object_or_404(
            CustomPageType, pk=pk,
            workspace__owner=request.user, is_deleted=False,
        )
        obj.is_deleted = True
        obj.save(update_fields=['is_deleted'])
        return Response(status=status.HTTP_204_NO_CONTENT)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Property Definitions
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class PropertyDefinitionListView(APIView):
    """
    GET  /api/properties/definitions/?workspace=<id>
    POST /api/properties/definitions/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = PropertyDefinition.objects.filter(
            workspace__owner=request.user,
            is_deleted=False,
        ).select_related('workspace')

        workspace_id = request.query_params.get('workspace')
        if workspace_id:
            qs = qs.filter(workspace_id=workspace_id)

        serializer = PropertyDefinitionSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        workspace_id = request.data.get('workspace')
        get_object_or_404(Workspace, pk=workspace_id, owner=request.user, is_deleted=False)

        serializer = PropertyDefinitionSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PropertyDefinitionDetailView(APIView):
    """
    GET    /api/properties/definitions/<pk>/
    PATCH  /api/properties/definitions/<pk>/
    DELETE /api/properties/definitions/<pk>/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        obj = get_object_or_404(
            PropertyDefinition, pk=pk,
            workspace__owner=request.user, is_deleted=False,
        )
        return Response(PropertyDefinitionSerializer(obj).data)

    def patch(self, request, pk):
        obj = get_object_or_404(
            PropertyDefinition, pk=pk,
            workspace__owner=request.user, is_deleted=False,
        )
        serializer = PropertyDefinitionSerializer(obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        obj = get_object_or_404(
            PropertyDefinition, pk=pk,
            workspace__owner=request.user, is_deleted=False,
        )
        obj.is_deleted = True
        obj.save(update_fields=['is_deleted'])
        return Response(status=status.HTTP_204_NO_CONTENT)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Property Values
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class PropertyValueListView(APIView):
    """
    GET  /api/properties/values/?page=<id>
    POST /api/properties/values/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = PropertyValue.objects.filter(
            page__workspace__owner=request.user,
            is_deleted=False,
        ).select_related('page', 'definition')

        page_id = request.query_params.get('page')
        if page_id:
            qs = qs.filter(page_id=page_id)

        serializer = PropertyValueSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        page_id = request.data.get('page')
        get_object_or_404(Page, pk=page_id, workspace__owner=request.user)

        serializer = PropertyValueSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PropertyValueDetailView(APIView):
    """
    GET    /api/properties/values/<pk>/
    PATCH  /api/properties/values/<pk>/
    DELETE /api/properties/values/<pk>/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        obj = get_object_or_404(
            PropertyValue, pk=pk,
            page__workspace__owner=request.user, is_deleted=False,
        )
        return Response(PropertyValueSerializer(obj).data)

    def patch(self, request, pk):
        obj = get_object_or_404(
            PropertyValue, pk=pk,
            page__workspace__owner=request.user, is_deleted=False,
        )
        serializer = PropertyValueSerializer(obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        obj = get_object_or_404(
            PropertyValue, pk=pk,
            page__workspace__owner=request.user, is_deleted=False,
        )
        obj.is_deleted = True
        obj.save(update_fields=['is_deleted'])
        return Response(status=status.HTTP_204_NO_CONTENT)
