from richpkg import helpers


class Base:
    def greet(self):
        return "base"


def beta():
    return len("beta")


def fact(n):
    return 1 if n <= 1 else n * fact(n - 1)


def alpha():
    beta()
    helpers.gamma()
    print("done")
    obj = Base()
    getattr(obj, "greet")()
    return obj
