"""V2 demo file -- one REAL python type error for the end-to-end squiggle."""


def shout(msg: str) -> str:
    return msg.upper()


def broken() -> str:
    result = "str" + 1
    return result
