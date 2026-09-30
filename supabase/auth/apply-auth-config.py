#!/usr/bin/env python3
"""Apply Fencely's code-only login email config to a Supabase project.

New users get the "Confirm signup" email, returning users get the "Magic link or OTP" email.
Both must carry {{ .Token }} and no link, or first-time signups never receive a code.

  export SUPABASE_ACCESS_TOKEN=...   # personal access token; never commit or paste it anywhere
  python3 supabase/auth/apply-auth-config.py <project_ref> [--site-url URL]            # preview only
  python3 supabase/auth/apply-auth-config.py <project_ref> [--site-url URL] --apply    # retype ref to confirm
  Production additionally needs --production.
"""
import argparse, json, os, sys, urllib.request, urllib.error
from pathlib import Path

API = os.environ.get("SUPABASE_API_URL", "https://api.supabase.com").rstrip("/")
PROD_REF = "ekhipvszzgwkweejifcf"
SUBJECT = "Your sign-in code"
TEMPLATE = (Path(__file__).resolve().parent / "email_otp.html").read_text()
INFO = ["mailer_autoconfirm", "mailer_otp_exp", "smtp_max_frequency", "uri_allow_list"]  # read-only, non-secret


def call(method, ref, token, body=None):
    req = urllib.request.Request(
        f"{API}/v1/projects/{ref}/config/auth", method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        sys.exit(f"API error {e.code}: {e.read().decode()[:300]}")


def same(a, b):
    return (a or "").strip() == (b or "").strip()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("ref"); p.add_argument("--site-url"); p.add_argument("--apply", action="store_true")
    p.add_argument("--production", action="store_true")
    a = p.parse_args()
    token = os.environ.get("SUPABASE_ACCESS_TOKEN") or sys.exit("Set SUPABASE_ACCESS_TOKEN first.")
    if "{{ .Token }}" not in TEMPLATE or "ConfirmationURL" in TEMPLATE:
        sys.exit("Template must contain {{ .Token }} and no {{ .ConfirmationURL }}.")
    if a.ref == PROD_REF and not a.production:
        sys.exit("That is the PRODUCTION project. Re-run with --production once you have approved it.")

    want = {
        "mailer_subjects_confirmation": SUBJECT, "mailer_templates_confirmation_content": TEMPLATE,
        "mailer_subjects_magic_link": SUBJECT, "mailer_templates_magic_link_content": TEMPLATE,
        "mailer_otp_length": 6,
    }
    if a.site_url:
        want["site_url"] = a.site_url.rstrip("/")

    cur = call("GET", a.ref, token)
    print(f"Project {a.ref}\n")
    for k, w in want.items():
        c = cur.get(k)
        if k.startswith("mailer_templates_"):
            body = c or ""
            note = f"has code={'{{ .Token }}' in body}, has link={'ConfirmationURL' in body}"
            print(f"  {k}: {'OK (already matches)' if same(c, w) else 'CHANGE'}  [current: {note}]")
        else:
            print(f"  {k}: {'OK (already matches)' if same(str(c), str(w)) else f'CHANGE  {c!r} -> {w!r}'}")
    if not a.site_url:
        print(f"  site_url: {cur.get('site_url')!r} (unchanged, pass --site-url to set)")
    print("\nInfo (not changed): " + ", ".join(f"{k}={cur.get(k)!r}" for k in INFO))

    if not a.apply:
        print("\nPreview only. Nothing changed. Add --apply to make these changes.")
        return
    if input(f"\nType the project ref ({a.ref}) to apply: ").strip() != a.ref:
        sys.exit("Ref did not match. Nothing changed.")
    call("PATCH", a.ref, token, want)
    after = call("GET", a.ref, token)
    bad = [k for k, w in want.items() if not same(str(after.get(k)), str(w))]
    if bad:
        sys.exit(f"Applied, but these did not read back correctly: {bad}")
    print("Applied and verified by reading the config back.")


if __name__ == "__main__":
    main()
