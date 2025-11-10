import pytest
from datetime import date
from django.test.utils import override_settings

from documents.models import (
    Document,
    DocumentAssignment,
    DispatchOutbox,
    Organization,
)


@pytest.mark.django_db
@override_settings(ROOT_URLCONF="config.urls", TESTING=True)
def test_create_incoming_document(client_with_user):
    client = client_with_user(username="vt-doc", role="VAN_THU", full_name="Văn Thư")
    payload = {
        "doc_direction": "den",
        "title": "Đơn kiến nghị",
        "received_number": 15,
        "received_date": "2025-01-05",
        "sender": "Sở Nội vụ",
    }

    resp = client.post("/api/v1/documents/", data=payload, format="json")
    assert resp.status_code == 201
    data = resp.json()
    assert data["doc_direction"] == "den"
    assert Document.objects.filter(document_id=data["id"], sender="Sở Nội vụ").exists()


@pytest.mark.django_db
@override_settings(ROOT_URLCONF="config.urls", TESTING=True)
def test_assignments_upsert_creates_rows(client_with_user, make_user):
    client = client_with_user(username="vt-assign", role="VAN_THU", full_name="VT Assign")
    doc = Document.objects.create(
        doc_direction="den",
        title="Văn bản phân công",
        received_number=11,
        received_date=date(2025, 1, 2),
        sender="UBND Quận 1",
    )
    assignee, _ = make_user(username="cv-doc", role="CHUYEN_VIEN", full_name="Chuyên viên VB")

    payload = {
        "assignments": [
            {
                "user_id": str(assignee.user_id),
                "role": "assignee",
                "due_at": "2025-01-10T08:00:00Z",
            }
        ]
    }

    resp = client.put(
        f"/api/v1/documents/{doc.document_id}/assignments/",
        data=payload,
        format="json",
    )
    assert resp.status_code == 200
    assert DocumentAssignment.objects.filter(document=doc, user=assignee).count() == 1


@pytest.mark.django_db
@override_settings(ROOT_URLCONF="config.urls", TESTING=True)
def test_dispatch_creation_records_outbox(client_with_user):
    client = client_with_user(username="vt-dispatch", role="VAN_THU", full_name="VT Dispatch")
    doc = Document.objects.create(
        doc_direction="di",
        title="Công văn phát hành",
        issue_number="123/UBND",
        issued_date=date(2025, 2, 1),
    )
    org = Organization.objects.create(name="Sở Y tế")

    payload = {
        "organization_id": org.organization_id,
        "method": DispatchOutbox.Method.POST,
        "note": "Gửi phát hành nhanh",
    }

    resp = client.post(
        f"/api/v1/documents/{doc.document_id}/dispatches/",
        data=payload,
        format="json",
    )
    assert resp.status_code == 201
    assert DispatchOutbox.objects.filter(document=doc, organization=org).count() == 1
