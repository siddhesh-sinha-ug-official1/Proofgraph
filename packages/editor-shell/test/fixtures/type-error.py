def add(a, b):
    return a + b


def double(x):
    return add(x, x)


def broken(y):
    unused_var = 1
    return y + undefined_name
