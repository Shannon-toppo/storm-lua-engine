import copy
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

font = load("font", "tools/generate-font.py")
arch = load("arch", "tools/check_repository.py")

class FontTests(unittest.TestCase):
    def setUp(self):
        self.data = json.loads((ROOT / "data/fonts/tiny-4x5.json").read_text())
    def test_complete_font(self): self.assertEqual(len(font.validate(self.data)), 95)
    def test_missing_glyph_rejected(self):
        self.data["glyphs"].pop()
        with self.assertRaises(ValueError): font.validate(self.data)
    def test_non_bitmap_value_rejected(self):
        self.data["glyphs"][0]["rows"][0] = 16
        with self.assertRaises(ValueError): font.validate(self.data)
    def test_boolean_is_not_row(self):
        self.data["glyphs"][0]["rows"][0] = True
        with self.assertRaises(ValueError): font.validate(self.data)
    def test_extra_glyphs_reject_duplicate_and_invalid_codepoints(self):
        extra = {"codepoint": 176, "rows": [6, 9, 6, 0, 0]}
        self.data["extras"] = [extra, extra]
        with self.assertRaises(ValueError): font.render(self.data)
        for code in (0x110000, 0xD800, 65):
            self.data["extras"] = [{"codepoint": code, "rows": [0] * 5}]
            with self.assertRaises(ValueError): font.render(self.data)

class ArchitectureTests(unittest.TestCase):
    def setUp(self):
        self.policy = {"a":{"role":"product","normal":[],"dev":[],"external":[]},"b":{"role":"product","normal":["a"],"dev":[],"external":[]}}
        self.meta = {"workspace_members":["a","b"],"packages":[{"id":"a","name":"a","manifest_path":"/a/Cargo.toml","dependencies":[]},{"id":"b","name":"b","manifest_path":"/b/Cargo.toml","dependencies":[{"name":"a","path":"/a","kind":None}]}]}
    def test_allowed_edge(self): arch.validate_architecture(self.meta,self.policy)
    def test_alias_does_not_hide_package(self):
        self.meta["packages"][1]["dependencies"][0].update(name="not-allowed",rename="a")
        with self.assertRaises(ValueError): arch.validate_architecture(self.meta,self.policy)
    def test_target_dependency_not_ignored(self):
        self.meta["packages"][0]["dependencies"]=[{"name":"b","path":"/b","target":"cfg(windows)","kind":None}]
        with self.assertRaises(ValueError): arch.validate_architecture(self.meta,self.policy)
    def test_test_crate_isolation(self):
        self.policy["a"]["role"]="test"
        with self.assertRaises(ValueError): arch.validate_architecture(self.meta,self.policy)
    def test_cycle_even_when_policy_allows_edges(self):
        self.policy["a"]["dev"]=["b"]
        self.meta["packages"][0]["dependencies"]=[{"name":"b","path":"/b","kind":"dev"}]
        with self.assertRaises(ValueError): arch.validate_architecture(self.meta,self.policy)
    def test_foreign_path_is_rejected(self):
        self.meta["packages"][1]["dependencies"][0]["path"]="/foreign"
        with self.assertRaises(ValueError): arch.validate_architecture(self.meta,self.policy)

if __name__ == "__main__": unittest.main()
