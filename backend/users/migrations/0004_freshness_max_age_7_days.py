from django.db import migrations

# The old default (60) is only overwritten where a profile still has it —
# no UI has ever exposed this knob, so nobody could have chosen 60 on purpose.
OLD_DEFAULT = 60
NEW_DEFAULT = 7


def narrow_existing_profiles(apps, schema_editor):
    Profile = apps.get_model("users", "Profile")
    for profile in Profile.objects.all().iterator():
        freshness = profile.freshness if isinstance(profile.freshness, dict) else {}
        if freshness.get("max_age_days", OLD_DEFAULT) != OLD_DEFAULT:
            continue
        freshness["max_age_days"] = NEW_DEFAULT
        profile.freshness = freshness
        profile.save(update_fields=["freshness"])


def widen_existing_profiles(apps, schema_editor):
    Profile = apps.get_model("users", "Profile")
    for profile in Profile.objects.all().iterator():
        freshness = profile.freshness if isinstance(profile.freshness, dict) else {}
        if freshness.get("max_age_days") != NEW_DEFAULT:
            continue
        freshness["max_age_days"] = OLD_DEFAULT
        profile.freshness = freshness
        profile.save(update_fields=["freshness"])


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0003_user_email_verified_at"),
    ]

    operations = [
        migrations.RunPython(narrow_existing_profiles, widen_existing_profiles),
    ]
