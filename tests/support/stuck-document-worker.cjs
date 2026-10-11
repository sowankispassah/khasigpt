// Deliberately CPU-bound disposable child verifies that the parser supervisor
// terminates work, rather than just timing out its waiting promise.
process.once('message', () => { while (true) { /* isolated test workload */ } });
