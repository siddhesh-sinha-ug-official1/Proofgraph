namespace demo {}

struct Vec { int x; };

class Widget {
 public:
  int size();
};

int Widget::size() { return 1; }

int main() { Widget w; return w.size(); }
