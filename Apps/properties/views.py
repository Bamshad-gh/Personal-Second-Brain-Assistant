# Apps/properties/views.py
"""
CRUD views for PropertyDefinition and PropertyValue.

Endpoints:
  GET  /api/properties/definitions/?workspace=<id>   → list definitions
  POST /api/properties/definitions/                  → create definition
  GET  /api/properties/definitions/<pk>/             → retrieve
  PATCH /api/properties/definitions/<pk>/            → update
  DELETE /api/properties/definitions/<pk>/           → delete

  GET  /api/properties/values/?page=<id>             → list values for a page
  POST /api/properties/values/                       → create value
  GET  /api/properties/values/<pk>/                  → retrieve
  PATCH /api/properties/values/<pk>/                 → update
  DELETE /api/properties/values/<pk>/                → delete

Security:
  - IsAuthenticated on all views
  - All ownership checks via workspace__owner=request.user (404 not 403)
"""

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404

from Apps.workspaces.models import Workspace
from Apps.pages.models import Page
from .models import PropertyDefinition, PropertyValue
from .serializers import PropertyDefinitionSerializer, PropertyValueSerializer


# ── Definitions ───────────────────────────────────────────────────────────────

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
        get_object_or_404(Workspace, pk=workspace_id, owner=request.user)

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


# ── Values ────────────────────────────────────────────────────────────────────

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
