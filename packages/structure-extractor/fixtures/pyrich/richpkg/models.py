import os

from richpkg import core


class Child(core.Base):
    def child_method(self):
        return os.path.join("a", "b")
