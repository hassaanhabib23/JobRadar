from rest_framework.routers import DefaultRouter

from jobs.views import JobViewSet, SourceViewSet

router = DefaultRouter()
router.register("jobs", JobViewSet, basename="job")
router.register("sources", SourceViewSet, basename="source")

urlpatterns = router.urls
