const DEFER_EVENT_LISTENER_TIME = 3000;
export const setSocketTimeout = (request, reject, timeoutInMs = 0) => {
    const registerTimeout = (offset) => {
        request.setTimeout(timeoutInMs - offset, () => {
            request.destroy();
            reject(Object.assign(new Error(`Connection timed out after ${timeoutInMs} ms`), { name: "TimeoutError" }));
        });
    };
    if (0 < timeoutInMs && timeoutInMs < 6000) {
        registerTimeout(0);
        return 0;
    }
    return setTimeout(registerTimeout.bind(null, timeoutInMs === 0 ? 0 : DEFER_EVENT_LISTENER_TIME), DEFER_EVENT_LISTENER_TIME);
};
