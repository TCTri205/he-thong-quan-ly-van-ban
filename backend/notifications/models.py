# apps/notifications/models.py
from django.conf import settings
from django.db import models
from django.utils import timezone


class Notification(models.Model):
    class Channel(models.TextChoices):
        APP = "app", "app"
        EMAIL = "email", "email"
        SMS = "sms", "sms"

    class Meta:
        db_table = "notifications"
        indexes = [models.Index(fields=["user", "read_at"])]

    notification_id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    title = models.CharField(max_length=200)
    body = models.CharField(max_length=1000, null=True, blank=True)
    link = models.CharField(max_length=500, null=True, blank=True)
    channel = models.CharField(max_length=20, default=Channel.APP, choices=Channel.choices)
    sent_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)


class Reminder(models.Model):
    class Entity(models.TextChoices):
        DOCUMENT = "document", "document"
        CASE = "case", "case"
        TASK = "task", "task"

    class Status(models.TextChoices):
        PENDING = "PENDING", "PENDING"
        SENT = "SENT", "SENT"
        CLEARED = "CLEARED", "CLEARED"

    class Meta:
        db_table = "reminders"
        indexes = [
            models.Index(fields=["due_at", "status"]),
        ]

    reminder_id = models.BigAutoField(primary_key=True)
    entity_type = models.CharField(max_length=20, choices=Entity.choices)
    entity_id = models.BigIntegerField()
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    due_at = models.DateTimeField()
    status = models.CharField(max_length=20, default=Status.PENDING, choices=Status.choices)
    last_notified_at = models.DateTimeField(null=True, blank=True)


class Job(models.Model):
    class Type(models.TextChoices):
        REMINDER = "REMINDER", "REMINDER"
        REPORT_EXPORT = "REPORT_EXPORT", "REPORT_EXPORT"
        SYNC_MAIL = "SYNC_MAIL", "SYNC_MAIL"

    class Status(models.TextChoices):
        QUEUED = "QUEUED", "QUEUED"
        RUNNING = "RUNNING", "RUNNING"
        DONE = "DONE", "DONE"
        FAILED = "FAILED", "FAILED"

    class Meta:
        db_table = "jobs"
        indexes = [models.Index(fields=["run_at", "status"])]

    job_id = models.BigAutoField(primary_key=True)
    type = models.CharField(max_length=50, choices=Type.choices)
    payload_json = models.JSONField()
    run_at = models.DateTimeField()
    status = models.CharField(max_length=20, default=Status.QUEUED, choices=Status.choices)
    attempts = models.IntegerField(default=0)
    last_error = models.CharField(max_length=500, null=True, blank=True)
