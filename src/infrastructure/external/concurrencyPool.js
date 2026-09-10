/**
 * Limit how many async tasks run at once (avoids overwhelming CORS proxies).
 */
export function createPool(limit) {
  let active = 0;
  const waiters = [];

  const release = () => {
    active--;
    const next = waiters.shift();
    if (next) next();
  };

  return function run(task) {
    return new Promise((resolve, reject) => {
      const start = async () => {
        active++;
        try {
          resolve(await task());
        } catch (e) {
          reject(e);
        } finally {
          release();
        }
      };

      if (active < limit) start();
      else waiters.push(start);
    });
  };
}
