from django.urls import path
from .views import (
    DatabaseViewDetail,
    DatabaseRowList,
    DatabaseRowDetail,
    DatabaseCellDetail,
    DatabaseColumnList,
    DatabaseColumnDetail,
    DatabaseEmailView,
)

urlpatterns = [
    path('<uuid:block_id>/',
         DatabaseViewDetail.as_view(), name='database-view-detail'),

    path('<uuid:block_id>/rows/',
         DatabaseRowList.as_view(), name='database-row-list'),

    path('<uuid:block_id>/rows/<uuid:row_id>/',
         DatabaseRowDetail.as_view(), name='database-row-detail'),

    path('<uuid:block_id>/rows/<uuid:row_id>/cells/<uuid:def_id>/',
         DatabaseCellDetail.as_view(), name='database-cell-detail'),

    path('<uuid:block_id>/columns/',
         DatabaseColumnList.as_view(), name='database-column-list'),

    path('<uuid:block_id>/columns/<uuid:col_id>/',
         DatabaseColumnDetail.as_view(), name='database-column-detail'),

    path('<uuid:block_id>/email/',
         DatabaseEmailView.as_view(), name='database-email'),
]
