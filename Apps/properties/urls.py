from django.urls import path
from . import views

urlpatterns = [
    path('custom-types/',           views.CustomPageTypeListCreateView.as_view()),
    path('custom-types/<uuid:pk>/', views.CustomPageTypeDetailView.as_view()),
    path('definitions/',           views.PropertyDefinitionListView.as_view()),
    path('definitions/<uuid:pk>/', views.PropertyDefinitionDetailView.as_view()),
    path('values/',                views.PropertyValueListView.as_view()),
    path('values/<uuid:pk>/',      views.PropertyValueDetailView.as_view()),
]
