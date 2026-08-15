from django.apps import AppConfig


class UsersConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "users"

    def ready(self) -> None:
        # Registers the post_save handler that gives every new user a profile.
        from users import signals  # noqa: F401
