#!/usr/bin/env python3
"""
AmarktAI Network v2 Backend API Test Suite
Tests all endpoints with focus on the critical end-to-end mock pipeline
"""

import requests
import time
import json
import sys

# Base URL from environment
BASE_URL = "https://amarktai-ai-platform.preview.emergentagent.com/api"

def log_test(name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {name}")
    if details:
        print(f"   {details}")
    return passed

def test_health():
    """Test GET /api/health"""
    try:
        resp = requests.get(f"{BASE_URL}/health", timeout=10)
        data = resp.json()
        passed = (
            resp.status_code == 200 and
            data.get("status") == "ok" and
            data.get("mode") == "mock"
        )
        return log_test("GET /api/health", passed, f"Status: {resp.status_code}, Mode: {data.get('mode')}")
    except Exception as e:
        return log_test("GET /api/health", False, str(e))

def test_capabilities():
    """Test GET /api/capabilities"""
    try:
        resp = requests.get(f"{BASE_URL}/capabilities", timeout=10)
        data = resp.json()
        caps = data.get("capabilities", [])
        passed = resp.status_code == 200 and len(caps) == 12
        return log_test("GET /api/capabilities", passed, f"Status: {resp.status_code}, Count: {len(caps)}/12")
    except Exception as e:
        return log_test("GET /api/capabilities", False, str(e))

def test_providers():
    """Test GET /api/providers"""
    try:
        resp = requests.get(f"{BASE_URL}/providers", timeout=10)
        data = resp.json()
        providers = data.get("providers", [])
        mimo = next((p for p in providers if p.get("id") == "mimo"), None)
        passed = (
            resp.status_code == 200 and
            len(providers) == 4 and
            mimo and mimo.get("tier") == "experimental"
        )
        return log_test("GET /api/providers", passed, f"Status: {resp.status_code}, Count: {len(providers)}/4, MiMo tier: {mimo.get('tier') if mimo else 'not found'}")
    except Exception as e:
        return log_test("GET /api/providers", False, str(e))

def test_stats():
    """Test GET /api/stats"""
    try:
        resp = requests.get(f"{BASE_URL}/stats", timeout=10)
        data = resp.json()
        jobs = data.get("jobs", {})
        readiness = data.get("readiness", [])
        passed = (
            resp.status_code == 200 and
            "total" in jobs and
            "queued" in jobs and
            "running" in jobs and
            "completed" in jobs and
            "failed" in jobs and
            len(readiness) == 8
        )
        return log_test("GET /api/stats", passed, f"Status: {resp.status_code}, Jobs total: {jobs.get('total')}, Readiness items: {len(readiness)}/8")
    except Exception as e:
        return log_test("GET /api/stats", False, str(e))

def test_events():
    """Test GET /api/events"""
    try:
        resp = requests.get(f"{BASE_URL}/events", timeout=10)
        data = resp.json()
        events = data.get("events", [])
        passed = resp.status_code == 200 and isinstance(events, list)
        return log_test("GET /api/events", passed, f"Status: {resp.status_code}, Events count: {len(events)}")
    except Exception as e:
        return log_test("GET /api/events", False, str(e))

def test_connections_crud():
    """Test connections CRUD and API key generation"""
    connection_id = None
    try:
        # Create connection
        payload = {
            "name": "Marketing App",
            "environment": "production",
            "dailyBudget": 250
        }
        resp = requests.post(f"{BASE_URL}/connections", json=payload, timeout=10)
        data = resp.json()
        connection = data.get("connection", {})
        connection_id = connection.get("id")
        
        create_passed = (
            resp.status_code == 201 and
            connection_id and
            connection.get("name") == "Marketing App" and
            connection.get("environment") == "production" and
            connection.get("dailyBudget") == 250 and
            isinstance(connection.get("keys"), list)
        )
        log_test("POST /api/connections", create_passed, f"Status: {resp.status_code}, ID: {connection_id}")
        
        if not connection_id:
            return False
        
        # Generate API key
        resp = requests.post(f"{BASE_URL}/connections/{connection_id}/keys", timeout=10)
        data = resp.json()
        key = data.get("key", {})
        token = key.get("token", "")
        
        key_passed = (
            resp.status_code == 201 and
            token.startswith("amk_") and
            key.get("id")
        )
        log_test("POST /api/connections/:id/keys", key_passed, f"Status: {resp.status_code}, Token prefix: {token[:12] if token else 'none'}")
        
        # Get connections
        resp = requests.get(f"{BASE_URL}/connections", timeout=10)
        data = resp.json()
        connections = data.get("connections", [])
        found = next((c for c in connections if c.get("id") == connection_id), None)
        
        get_passed = (
            resp.status_code == 200 and
            found and
            len(found.get("keys", [])) > 0
        )
        log_test("GET /api/connections", get_passed, f"Status: {resp.status_code}, Found connection with keys: {len(found.get('keys', [])) if found else 0}")
        
        # Delete connection
        resp = requests.delete(f"{BASE_URL}/connections/{connection_id}", timeout=10)
        delete_passed = resp.status_code == 200 and resp.json().get("ok") == True
        log_test("DELETE /api/connections/:id", delete_passed, f"Status: {resp.status_code}")
        
        return create_passed and key_passed and get_passed and delete_passed
        
    except Exception as e:
        log_test("Connections CRUD", False, str(e))
        return False

def test_simulate():
    """Test POST /api/simulate"""
    try:
        payload = {
            "type": "image.generate",
            "payload": {"prompt": "test prompt"}
        }
        resp = requests.post(f"{BASE_URL}/simulate", json=payload, timeout=10)
        data = resp.json()
        
        passed = (
            resp.status_code == 200 and
            data.get("ok") == True and
            data.get("routed_to") == "image.generate" and
            "trace_id" in data
        )
        return log_test("POST /api/simulate", passed, f"Status: {resp.status_code}, Routed to: {data.get('routed_to')}")
    except Exception as e:
        return log_test("POST /api/simulate", False, str(e))

def test_settings():
    """Test settings GET and PUT"""
    try:
        # Update settings
        payload = {"settings": {"asset_retention_days": 45}}
        resp = requests.put(f"{BASE_URL}/settings", json=payload, timeout=10)
        put_passed = resp.status_code == 200 and resp.json().get("ok") == True
        log_test("PUT /api/settings", put_passed, f"Status: {resp.status_code}")
        
        # Get settings
        resp = requests.get(f"{BASE_URL}/settings", timeout=10)
        data = resp.json()
        settings = data.get("settings", {})
        
        get_passed = (
            resp.status_code == 200 and
            settings.get("asset_retention_days") == 45
        )
        log_test("GET /api/settings", get_passed, f"Status: {resp.status_code}, asset_retention_days: {settings.get('asset_retention_days')}")
        
        return put_passed and get_passed
    except Exception as e:
        log_test("Settings", False, str(e))
        return False

def test_job_pipeline(job_type, expected_mime):
    """Test end-to-end job pipeline for a specific job type"""
    job_id = None
    artifact_id = None
    
    try:
        # Step 1: Create job
        payload = {
            "type": job_type,
            "label": f"test {job_type}",
            "payload": {"prompt": "a test prompt"}
        }
        resp = requests.post(f"{BASE_URL}/jobs", json=payload, timeout=10)
        data = resp.json()
        job = data.get("job", {})
        job_id = job.get("id")
        
        create_passed = (
            resp.status_code == 201 and
            job_id and
            job.get("status") == "queued" and
            job.get("progress") == 0 and
            job.get("artifactId") is None
        )
        log_test(f"POST /api/jobs ({job_type})", create_passed, f"Status: {resp.status_code}, Job ID: {job_id}, Initial status: {job.get('status')}")
        
        if not job_id:
            return False
        
        # Step 2: Poll for completion (up to 8 seconds)
        max_polls = 16
        poll_interval = 0.5
        completed = False
        final_status = None
        
        print(f"   Polling job {job_id} for completion...")
        for i in range(max_polls):
            time.sleep(poll_interval)
            resp = requests.get(f"{BASE_URL}/jobs/{job_id}", timeout=10)
            data = resp.json()
            job = data.get("job", {})
            status = job.get("status")
            progress = job.get("progress")
            artifact_id = job.get("artifactId")
            
            print(f"   Poll {i+1}/{max_polls}: status={status}, progress={progress}, artifactId={artifact_id}")
            
            if status == "completed":
                completed = True
                final_status = status
                break
            elif status == "failed":
                final_status = status
                break
        
        poll_passed = (
            completed and
            job.get("progress") == 100 and
            artifact_id is not None
        )
        log_test(f"Poll GET /api/jobs/:id ({job_type})", poll_passed, f"Final status: {final_status}, Progress: {job.get('progress')}, Artifact ID: {artifact_id}")
        
        if not poll_passed:
            return False
        
        # Step 3: Verify artifact exists in list
        resp = requests.get(f"{BASE_URL}/artifacts", timeout=10)
        data = resp.json()
        artifacts = data.get("artifacts", [])
        found_artifact = next((a for a in artifacts if a.get("jobId") == job_id), None)
        
        artifact_list_passed = (
            resp.status_code == 200 and
            found_artifact and
            found_artifact.get("id") == artifact_id and
            "retrievalPath" in found_artifact
        )
        log_test(f"GET /api/artifacts ({job_type})", artifact_list_passed, f"Status: {resp.status_code}, Found artifact: {found_artifact.get('id') if found_artifact else 'none'}")
        
        if not artifact_list_passed:
            return False
        
        # Step 4: Download artifact
        retrieval_path = found_artifact.get("retrievalPath")
        resp = requests.get(f"{BASE_URL.replace('/api', '')}{retrieval_path}", timeout=10)
        content_type = resp.headers.get("Content-Type", "")
        
        download_passed = (
            resp.status_code == 200 and
            content_type == expected_mime and
            len(resp.content) > 0
        )
        log_test(f"GET {retrieval_path} ({job_type})", download_passed, f"Status: {resp.status_code}, Content-Type: {content_type}, Size: {len(resp.content)} bytes")
        
        return create_passed and poll_passed and artifact_list_passed and download_passed
        
    except Exception as e:
        log_test(f"Job pipeline ({job_type})", False, str(e))
        return False

def main():
    """Run all tests"""
    print("=" * 80)
    print("AmarktAI Network v2 Backend API Test Suite")
    print("=" * 80)
    print(f"Base URL: {BASE_URL}")
    print("=" * 80)
    print()
    
    results = []
    
    # Basic endpoints
    print("Testing basic endpoints...")
    results.append(test_health())
    results.append(test_capabilities())
    results.append(test_providers())
    results.append(test_stats())
    results.append(test_events())
    print()
    
    # Connections CRUD
    print("Testing connections CRUD...")
    results.append(test_connections_crud())
    print()
    
    # Simulate
    print("Testing simulate endpoint...")
    results.append(test_simulate())
    print()
    
    # Settings
    print("Testing settings...")
    results.append(test_settings())
    print()
    
    # Critical end-to-end pipelines
    print("Testing CRITICAL end-to-end job pipelines...")
    print("(This will take ~15 seconds as jobs complete in ~4.5s each)")
    print()
    
    print("Pipeline 1: image.generate -> image/svg+xml")
    results.append(test_job_pipeline("image.generate", "image/svg+xml"))
    print()
    
    print("Pipeline 2: text.chat -> text/markdown")
    results.append(test_job_pipeline("text.chat", "text/markdown"))
    print()
    
    print("Pipeline 3: voice.tts -> audio/wav")
    results.append(test_job_pipeline("voice.tts", "audio/wav"))
    print()
    
    # Summary
    print("=" * 80)
    passed = sum(results)
    total = len(results)
    print(f"SUMMARY: {passed}/{total} tests passed")
    print("=" * 80)
    
    if passed == total:
        print("✅ ALL TESTS PASSED - Backend API is fully functional")
        return 0
    else:
        print(f"❌ {total - passed} test(s) failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())
