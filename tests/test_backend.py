import unittest
from api.index import turns_from_json, parse_pasted_text, prepare, extract


class TestBackendPayloads(unittest.TestCase):
    def test_shape_messages_list(self):
        """Test bookmarklet payload with direct messages list."""
        payload = {
            "v": 1,
            "provider": "chatgpt",
            "url": "https://chatgpt.com/c/123",
            "title": "Quantum Physics Chat",
            "messages": [
                {"role": "user", "text": "Explain entanglement"},
                {"role": "assistant", "text": "Quantum entanglement is a phenomenon..."}
            ],
            "diagnostics": {
                "provider": "chatgpt",
                "method": "dom",
                "user_count": 1,
                "assistant_count": 1,
                "total_messages": 2,
                "total_chars": 60,
                "warnings": []
            }
        }
        warnings = []
        res = turns_from_json(payload, warnings)
        self.assertEqual(len(res["turns"]), 2)
        self.assertEqual(res["turns"][0]["role"], "user")
        self.assertEqual(res["turns"][0]["text"], "Explain entanglement")
        self.assertEqual(res["turns"][1]["role"], "assistant")
        self.assertEqual(res["title"], "Quantum Physics Chat")

    def test_shape_nested_claude_snapshot(self):
        """Test bookmarklet payload with nested Claude snapshot."""
        payload = {
            "v": 1,
            "provider": "claude",
            "url": "https://claude.ai/share/00000000-0000-0000-0000-000000000000",
            "title": "Claude Snapshot Chat",
            "snapshot": {
                "chat_messages": [
                    {
                        "sender": "human",
                        "text": "What is Python?",
                        "content": [{"type": "text", "text": "What is Python?"}]
                    },
                    {
                        "sender": "assistant",
                        "text": "Python is a programming language.",
                        "content": [{"type": "text", "text": "Python is a programming language."}]
                    }
                ]
            },
            "diagnostics": {
                "provider": "claude",
                "method": "snapshot",
                "user_count": 1,
                "assistant_count": 1,
                "total_messages": 2,
                "total_chars": 45,
                "warnings": ["Snapshot fetched directly"]
            }
        }
        warnings = []
        res = turns_from_json(payload, warnings)
        self.assertEqual(len(res["turns"]), 2)
        self.assertEqual(res["turns"][0]["role"], "user")
        self.assertEqual(res["turns"][1]["role"], "assistant")
        self.assertEqual(res["title"], "Claude Snapshot Chat")
        self.assertIn("Snapshot fetched directly", warnings)

    def test_shape_nested_chatgpt_mapping(self):
        """Test bookmarklet payload with nested ChatGPT mapping format."""
        mapping_data = {
            "mapping": {
                "root": {"id": "root", "parent": None, "children": ["m1"]},
                "m1": {
                    "id": "m1",
                    "parent": "root",
                    "children": ["m2"],
                    "message": {
                        "author": {"role": "user"},
                        "content": {"parts": ["Hello ChatGPT"]}
                    }
                },
                "m2": {
                    "id": "m2",
                    "parent": "m1",
                    "children": [],
                    "message": {
                        "author": {"role": "assistant"},
                        "content": {"parts": ["Hello! How can I assist you today?"]}
                    }
                }
            },
            "current_node": "m2"
        }
        payload = {
            "v": 1,
            "provider": "chatgpt",
            "title": "ChatGPT Mapping Chat",
            "snapshot": mapping_data,
            "diagnostics": {
                "warnings": ["Mapping processed"]
            }
        }
        warnings = []
        res = turns_from_json(payload, warnings)
        self.assertEqual(len(res["turns"]), 2)
        self.assertEqual(res["turns"][0]["text"], "Hello ChatGPT")
        self.assertEqual(res["turns"][1]["text"], "Hello! How can I assist you today?")
        self.assertEqual(res["title"], "ChatGPT Mapping Chat")
        self.assertIn("Mapping processed", warnings)

    def test_diagnostics_warnings_propagation(self):
        """Test that diagnostics warnings from bookmarklet reach the user warnings."""
        import json
        payload = {
            "v": 1,
            "provider": "grok",
            "title": "Grok Unparsed Chat",
            "messages": [
                {"role": "user", "text": "Raw unstructured text captured from page"}
            ],
            "diagnostics": {
                "provider": "grok",
                "method": "dom",
                "warnings": ["Could not identify speaker roles; captured page content as one message."]
            }
        }
        parsed = parse_pasted_text(json.dumps(payload))
        self.assertIn("Could not identify speaker roles; captured page content as one message.", parsed["warnings"])

    def test_end_to_end_prepare_and_extract(self):
        """Test full prepare() and extract() pipeline with a bookmarklet JSON string."""
        import json
        import asyncio
        payload_str = json.dumps({
            "v": 1,
            "provider": "gemini",
            "title": "Gemini Q&A",
            "messages": [
                {"role": "user", "text": "Write a python function to add two numbers."},
                {"role": "assistant", "text": "```python\ndef add(a, b):\n    return a + b\n```"}
            ]
        })
        prep = prepare({
            "text": payload_str,
            "budgetMode": "fixed",
            "budgetValue": "5000",
            "recent": "8",
            "format": "readme"
        })
        self.assertEqual(prep["mode"], "text")
        loop = asyncio.new_event_loop()
        extracted = loop.run_until_complete(extract(prep))
        loop.close()
        self.assertEqual(len(extracted["turns"]), 2)
        self.assertEqual(extracted["title"], "Gemini Q&A")


if __name__ == "__main__":
    unittest.main()

