#!/usr/bin/env python3
"""Synchronize new Jungle Gym Google Sheet rows with Supabase."""

import json
import os
import re
import sys
from datetime import datetime
from urllib.parse import quote

import requests
from dateutil.relativedelta import relativedelta
from google.auth.transport.requests import Request
from google.oauth2 import service_account


SHEET_TAB = os.getenv("GOOGLE_SHEET_TAB", "Form Responses 1")
START_ROW = int(os.getenv("GOOGLE_START_ROW", "201"))
SHEET_ID = os.environ["GOOGLE_SHEET_ID"]
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_PUBLISHABLE_KEY"]
SYNC_SECRET = os.environ["SYNC_SECRET"]

MONTHS_BY_PLAN = {
    "per month": 1,
    "two month": 2,
    "3 months": 3,
    "6 months": 6,
    "6 months (couple)": 6,
    "annual": 12,
    "annual (couple)": 12,
}


def normalize_header(value):
    value = str(value or "").replace("’", "'").replace("‘", "'")
    return re.sub(r"\s+", " ", value).strip().lower()


def cell(headers, row, name):
    index = headers.get(normalize_header(name))
    return "" if index is None or index >= len(row) else row[index]


def text(value):
    return str(value or "").strip().removesuffix(".0")


def number(value):
    cleaned = re.sub(r"[^0-9.\-]", "", str(value or ""))
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def iso_date(value):
    value = str(value or "").strip()
    if not value:
        return ""
    value = value.split(" ")[0]
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            pass
    raise ValueError(f"Unsupported date: {value}")


def expiry_date(start_date, plan):
    if not start_date:
        return ""
    months = MONTHS_BY_PLAN.get(plan.strip().lower())
    if not months:
        return ""
    return (datetime.strptime(start_date, "%Y-%m-%d").date() + relativedelta(months=months)).isoformat()


def google_rows():
    info = json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"])
    credentials = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
    )
    credentials.refresh(Request())
    sheet_range = quote(f"{SHEET_TAB}!A1:ZZ", safe="")
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{sheet_range}"
    response = requests.get(
        url,
        headers={"Authorization": f"Bearer {credentials.token}"},
        params={"valueRenderOption": "FORMATTED_VALUE"},
        timeout=60,
    )
    response.raise_for_status()
    return response.json().get("values", [])


def build_payload(headers, row, row_number):
    plan = text(cell(headers, row, "Subscription Plan"))
    timestamp = iso_date(cell(headers, row, "Timestamp"))
    payment = iso_date(cell(headers, row, "Date of Payment Made")) or timestamp
    expiry = iso_date(cell(headers, row, "Expiry Date")) or expiry_date(payment, plan)
    return {
        "full_name": text(cell(headers, row, "Full Name")),
        "identity_number": text(cell(headers, row, "National Identity Card / Driving License / Passport Number")),
        "member_code": text(cell(headers, row, "Membership ID")),
        "plan_name": plan,
        "paid_amount": number(cell(headers, row, "Paid Amount")),
        "receipt_number": text(cell(headers, row, "Receipt Number")),
        "special_notes": text(cell(headers, row, "Special Notes")),
        "payment_method": text(cell(headers, row, "Paid by")),
        "email": text(cell(headers, row, "Email Address")),
        "phone": text(cell(headers, row, "Contact Number")),
        "partner_name": text(cell(headers, row, "Partner's Name (Fill this only for couple packages)")),
        "payment_date": payment,
        "start_date": payment,
        "expiry_date": expiry,
        "source_row_key": f"google-sheet:{SHEET_ID}:{SHEET_TAB}:{row_number}",
    }


def sync_payload(payload, row_number):
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/sync_membership_from_sheet",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
        },
        json={"p_secret": SYNC_SECRET, "p_row": payload},
        timeout=60,
    )
    if not response.ok:
        raise RuntimeError(f"Row {row_number}: {response.status_code} {response.text}")


def main():
    values = google_rows()
    if not values:
        print("The Google Sheet is empty.")
        return

    headers = {normalize_header(name): index for index, name in enumerate(values[0])}
    synced = 0
    skipped = 0
    failures = []

    for row_number, row in enumerate(values[1:], start=2):
        if row_number < START_ROW:
            continue
        try:
            payload = build_payload(headers, row, row_number)
            if not payload["full_name"]:
                skipped += 1
                continue
            sync_payload(payload, row_number)
            synced += 1
        except Exception as exc:
            failures.append(str(exc))

    print(f"Sync complete: {synced} row(s) synchronized, {skipped} blank row(s) skipped.")
    if failures:
        print("\n".join(failures), file=sys.stderr)
        raise SystemExit(f"{len(failures)} row(s) failed.")


if __name__ == "__main__":
    main()
