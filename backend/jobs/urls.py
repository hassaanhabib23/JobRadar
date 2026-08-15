from django.urls import path
from rest_framework.routers import DefaultRouter

from jobs.views import JobViewSet, RunViewSet, SourceViewSet, StatsView

router = DefaultRouter()
router.register("jobs", JobViewSet, basename="job")
router.register("sources", SourceViewSet, basename="source")
router.register("runs", RunViewSet, basename="run")

urlpatterns = [
    *router.urls,
    path("stats/", StatsView.as_view(), name="stats"),
]
