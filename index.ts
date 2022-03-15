function ensureCallable(fn: any) {
  if (typeof fn !== 'function') throw new TypeError(fn + " is not a function");
  return fn;
}

function byObserver(Observer: any) {
  const node = document.createTextNode('')
  let queue: any, currentQueue: any, bit = 0, i = 0;
  new Observer(function () {
    let callback;
    if (!queue) {
      if (!currentQueue) return;
      queue = currentQueue;
    } else if (currentQueue) {
      queue = currentQueue.slice(i).concat(queue);
    }
    currentQueue = queue;
    queue = null;
    i = 0;
    if (typeof currentQueue === 'function') {
      callback = currentQueue;
      currentQueue = null;
      callback();
      return;
    }
    node.data = (bit = ++bit % 2) as any; // Invoke other batch, to handle leftover callbacks in case of crash
    while (i < currentQueue.length) {
      callback = currentQueue[i];
      i++;
      if (i === currentQueue.length) currentQueue = null;
      callback();
    }
  }).observe(node, {characterData: true});

  return function (fn: any) {
    ensureCallable(fn);
    if (queue) {
      if (typeof queue === 'function') queue = [queue, fn];
      else queue.push(fn);
      return;
    }
    queue = fn;
    node.data = (bit = ++bit % 2) as any;
  };
}

const nextTick = (function () {
  // queueMicrotask
  if (typeof queueMicrotask === "function") {
    return function (cb: any) {
      queueMicrotask(ensureCallable(cb));
    };
  }

  // MutationObserver
  if ((typeof document === 'object') && document) {
    if (typeof MutationObserver === 'function') return byObserver(MutationObserver);
    if (typeof (window as any).WebKitMutationObserver === 'function') return byObserver((window as any).WebKitMutationObserver);
  }

  // W3C Draft
  // http://dvcs.w3.org/hg/webperf/raw-file/tip/specs/setImmediate/Overview.html
  if (typeof setImmediate === 'function') {
    return function (cb: any) {
      setImmediate(ensureCallable(cb));
    };
  }

  // Wide available standard
  if ((typeof setTimeout === 'function') || (typeof setTimeout === 'object')) {
    return function (cb: any) {
      setTimeout(ensureCallable(cb), 0);
    };
  }

  throw new Error('No `nextTick` implementation found')
}());

export class Semaphore {
  private tasks: (() => void)[] = [];
  count: number;

  constructor(count: number) {
    this.count = count;
  }

  private sched() {
    if (this.count > 0 && this.tasks.length > 0) {
      this.count--;
      let next = this.tasks.shift();
      if (next === undefined) {
        throw "Unexpected undefined value in tasks list";
      }

      next();
    }
  }

  public acquire() {
    return new Promise<() => void>((res, _rej) => {
      const task = () => {
        let released = false;
        res(() => {
          if (!released) {
            released = true;
            this.count++;
            this.sched();
          }
        });
      };
      this.tasks.push(task);
      nextTick(this.sched.bind(this))
    });
  }

  public use<T>(f: () => Promise<T>) {
    return this.acquire()
      .then(release => {
        return f()
          .then((res) => {
            release();
            return res;
          })
          .catch((err) => {
            release();
            throw err;
          });
      });
  }
}

export class Mutex extends Semaphore {
  constructor() {
    super(1);
  }
}
