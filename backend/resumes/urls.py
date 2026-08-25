from django.urls import path

from resumes.views import ResumeView

urlpatterns = [
    path("resume/", ResumeView.as_view(), name="resume"),
]
