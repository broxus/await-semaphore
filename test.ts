import {Semaphore, Mutex} from './index';
const assert = require('assert');

export function delay(ms: number) {
    return new Promise<void>((res, _rej) => setTimeout(res, ms));
}

describe('util', function() {
    describe('semaphore', function() {
        it('limits concurrency', async function() {
            const s = new Semaphore(2);
            let running = 0;
            let ran = 0;
            const task = async () => {
                const release = await s.acquire();
                assert(running <= 1);
                running++;
                await delay(10);
                assert(running <= 2);
                running--;
                ran++;
                release();
            };
            await Promise.all([1,2,3,4,5].map(_i => task()));
            assert.strictEqual(ran, 5);
        });

        it('limits concurrency (use syntax)', async function() {
            const s = new Semaphore(2);
            let running = 0;
            let ran = 0;
            const task = async () => {
                assert(running <= 1);
                running++;
                await delay(10);
                assert(running <= 2);
                running--;
                ran++;
            };
            await Promise.all([1,2,3,4,5].map(_i => s.use(task)));
            assert.strictEqual(ran, 5);
        });

        it('use recovers from thrown exception', async function() {
            const s = new Semaphore(2);
            let running = 0;
            let ran = 0;
            let erred = 0;
            const task = (i: number) => async () => {
                assert(running <= 1);
                running++;
                await delay(10);
                assert(running <= 2);
                running--;
                if (i === 2) {
                    throw new Error('bogus');
                }
                ran++;
            };
            await s.use(task(1));
            try {
                await s.use(task(2));
            } catch (err) {
                erred++;
            }
            await s.use(task(3));
            await s.use(task(4));
            await s.use(task(5));
            assert.strictEqual(ran, 4);
            assert.strictEqual(erred, 1);
            assert.strictEqual(s.count, 2);
        });

    });

    describe('mutex', function() {
        it('tasks do not overlap', function(done) {
            const m = new Mutex();
            let task1running = false;
            let task2running = false;
            let task1ran = false;
            let task2ran = false;
            Promise.all([
                m.acquire()
                .then(release => {
                    task1running = true;
                    task1ran = true;
                    return delay(10)
                    .then(() => {
                        assert(!task2running);
                        task1running = false;
                        release();
                    });
                }),
                m.acquire().
                then(release => {
                    assert(!task1running);
                    task2running = true;
                    task2ran = true;
                    return delay(10)
                    .then(() => {
                        task2running = false;
                        release();
                    });
                })
            ])
            .then(() => {
                assert(!task1running);
                assert(!task2running);
                assert(task1ran);
                assert(task2ran);
                done();
            })
            .catch(done);
        });
        it('double lock deadlocks', function(done) {
            const m = new Mutex();
            m.acquire()
            .then(_r => m.acquire())
            .then(_r => assert(false))
            .catch(done);
            delay(10)
            .then(done);
        });
        it('double release ok', function(done) {
            let release: () => void;
            const m = new Mutex();
            m.acquire().
                then(r => release = r).
                then(() => release()).
                then(() => release());
            m.acquire().
                then(_r => done());
        });
    });
});
