from django.urls import path

from users import views

urlpatterns = [
    path("auth/register/", views.RegisterView.as_view(), name="auth-register"),
    path("auth/login/", views.LoginView.as_view(), name="auth-login"),
    path("auth/refresh/", views.RefreshView.as_view(), name="auth-refresh"),
    path("auth/logout/", views.LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", views.MeView.as_view(), name="auth-me"),
    path("auth/password/", views.PasswordChangeView.as_view(), name="auth-password"),
    path("locations/", views.LocationListView.as_view(), name="locations"),
    path("profile/", views.ProfileView.as_view(), name="profile"),
    path("profile/preview/", views.ProfilePreviewView.as_view(), name="profile-preview"),
]
