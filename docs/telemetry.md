# Telemetry

## Development

See [aws-toolkit-common/telemetry](https://github.com/aws/aws-toolkit-common/tree/main/telemetry#telemetry) for full details about defining telemetry metrics.

-   You can define new metrics during development by adding items to
    [telemetry/vscodeTelemetry.json](https://github.com/aws/aws-toolkit-vscode/blob/21ca0fca26d677f105caef81de2638b2e4796804/src/shared/telemetry/vscodeTelemetry.json).
    -   The `generateClients` build task generates new symbols in `shared/telemetry/telemetry`, which you can import via:
        ```
        import { telemetry } from '/shared/telemetry/telemetry'
        ```
    -   When your feature is released, the "development" metrics you defined in `vscodeTelemetry.json` should be upstreamed to [aws-toolkit-common](https://github.com/aws/aws-toolkit-common/blob/main/telemetry/definitions/commonDefinitions.json).
-   Metrics are dropped (not posted to the service) if the extension is running in [CI or other
    automation tasks](https://github.com/aws/aws-toolkit-vscode/blob/21ca0fca26d677f105caef81de2638b2e4796804/src/shared/vscode/env.ts#L71-L73).
    -   You can always _test_ telemetry via [assertTelemetry()](https://github.com/aws/aws-toolkit-vscode/blob/21ca0fca26d677f105caef81de2638b2e4796804/src/test/testUtil.ts#L164), regardless of the current environment.

## Guidelines

-   Use `run()` where possible. It automatically sets the `result` and `reason` fields. See below for details.
    -   `run()` gets the `reason` value from the `Error.code` property of any exception that is thrown.
    -   Your code can throw `ToolkitError` with a `code` field to communicate errors, validation issues, or [cancellation](https://github.com/aws/aws-toolkit-vscode/blob/06661f84530c6b5331579871d685515700b7767e/src/auth/sso/model.ts#L138). See below.
-   The `reason` and `result` fields are standard metric fields shared by all Toolkits (VSCode, JetBrains, VisualStudio).
    They should be used instead of special-purpose metrics or fields.
-   `result` allows the Toolkits team to monitor all features for potential regressions.
-   `reason` gives insight into the cause of a `result=Failed` metric.
-   `telemetry.record()` called during a `telemetry.foo.run(…)` context will automatically annotate the current `foo` metric.
    -   For example, the cloudwatch logs feature adds `hasTimeFilter` info its metrics by [calling telemetry.record()](https://github.com/aws/aws-toolkit-vscode/blob/06661f84530c6b5331579871d685515700b7767e/src/cloudWatchLogs/cloudWatchLogsUtils.ts#L21-L24).

## Incrementally Building a Metric

User actions or other features may have multiple stages/steps, called a "workflow" or just "flow". A telemetry ["trace"](https://opentelemetry.io/docs/concepts/signals/traces/) captures a flow as tree of ["spans"](https://opentelemetry.io/docs/concepts/signals/traces/#spans).

For example, `setupThing()` has multiple steps until it is completed, ending with `lastSetupStep()`.

```typescript
function setupThing() {
    setupStep1()
    setupStep2()
    ...
    lastSetupStep()
}
```

<br>

If we want to send a metric event, lets call it `metric_setupThing`, then the code could look something like this:

```typescript
function setupThing() {
    try {
        ...
        lastSetupStep()
        telemetry.metric_setupThing.emit({result: 'Succeeded', ...})
    }
    catch (e) {
        telemetry.metric_setupThing.emit({result: 'Failed', reason: 'Not Really Sure Why' ...})
    }
}
```

Here we emitted a final metric based on the failure or success of the entire execution. Each metric is discrete and immediately gets sent to the telemetry service.

<br>

But usually code is not flat and there are many nested calls. If something goes wrong during the execution it would be useful to have more specific information at the area of failure. For that we can use `run()` along with `telemetry.record()`.

`run()` accepts a callback, and when the callback is executed, any uses of `telemetry.record()` at _any nesting level_ during execution of that callback, will update the
attributes of the ["current metric"](https://github.com/aws/aws-toolkit-vscode/blob/13cb98d5315092ddc9eb5ba898e5f26810dada25/src/shared/telemetry/spans.ts#L233).
And at the end (that is, when `run()` returns) we will emit a single metric with the last updated attributes.
[Example](https://github.com/aws/aws-toolkit-vscode/blob/06661f84530c6b5331579871d685515700b7767e/src/cloudWatchLogs/cloudWatchLogsUtils.ts#L21-L24)

When an exception is thrown from a `run()` context, `run()` will [automatically set](https://github.com/aws/aws-toolkit-vscode/blob/a583825bec6cb68c4942fa60d185644833528532/src/shared/errors.ts#L273-L289)
the `reason` field based on the Error `code` field. You can explicitly set `code` when throwing
a `ToolkitError`, for [example](https://github.com/aws/aws-toolkit-vscode/blob/d08e59952a6c75a5c6c00fdc464e26750c0e85f5/src/auth/auth.ts#L530):

    throw new ToolkitError('No sso-session name found in ~/.aws/config', { code: 'NoSsoSessionName' })

Note: prefer reason codes with a format similar to existing codes (not sentences). You can find existing codes by searching the codebase:

    git grep 'code: '

### Example

```typescript
setupThing()

function setupThing() {
    // Start the run() for metric_setupThing
    telemetry.metric_setupThing.run(span => {
        // Update the metric with initial attributes
        span.record({sessionId: '123456'}) // now no matter where the control flow exits after this line in this method, this attribute will always be set
        ...
        setupStep2()
        ...

        if (userInput.CancelSelected) {
            // By setting the `cancelled` attribute to true, the `result` attribute will be set to Cancelled
            throw new ToolkitError("Thing has been cancelled", { cancelled: true})
        }
    })
    // At this point the final values from the `record()` calls are used to emit a the final metric.
    // If no exceptions have been thrown, the `result` attribute is automatically set to Success.
}

function setupStep2() {
    try {
        // Do work
    }
    catch (e) {
        // Here we can update the metric with more specific information regarding the failure.

        // Also notice we are able to use `telemetry.metric_setupThing` versus `span`.
        // This is due to `metric_setupThing` being added to the "context" from the above run()
        // callback argument. So when we use record() below it will update the same
        // thing that span.record() does.

        // Keep in mind record() must be run inside the callback argument of run() for
        // the attributes of that specific metric to be updated.
        telemetry.metric_setupThing.record({
            workDone: // ...
        })
        // If this exception is allowed to propogate to the `run()`, then the `result` will be automatically set to Failed and the `reason` to the `code` set here
        throw new ToolkitError(e as Error, { code: "SomethingWentWrongInStep2"})
    }
}
```

<br>

Finally, if `setupStep2()` was the thing that failed we would see a metric like:

```
{
    "metadata.metricName": "metric_setupThing",
    "sessionId": "123456",
    "result": "Failed",
    "reason": "SomethingWentWrongInStep2",
    ...
}
```

## Adding a "Stack Trace" to your metric

### Problem

Common example: _"I have a function, `thisFailsSometimes()` that is called in multiple places. The function sometimes fails, I know from telemetry, but I do not know if it is failing when it is a specific caller. If I knew the call stack/trace that it took to call my function that would help me debug."_

```typescript
function outerA() {
    thisFailsSometimes(1) // this succeeds
}

function outerB() {
    thisFailsSometimes(0) // this fails
}

function thisFailsSometimes(num: number) {
    return telemetry.my_Metric.run(() => {
        if (number === 0) {
            throw Error('Cannot be 0')
        }
        ...
    })
}
```

### Solution

Add a value to `function` in the options of a `run()`. This will result in a stack of functions identifiers that were previously called
before `thisFailsSometimes()` was run. You can then retrieve the stack in the `run()` of your final metric using `getFunctionStack()`.

```typescript
function outerA() {
    telemetry.my_Metric.run(() => thisFailsSometimes(1), { functionId: { name: 'outerA' }})
}

function outerB() {
    telemetry.my_Metric.run(() => thisFailsSometimes(0), { functionId: { source: 'outerB' }})
}

function thisFailsSometimes(num: number) {
    return telemetry.my_Metric.run(() => {
        telemetry.record({ theCallStack: asStringifiedStack(telemetry.getFunctionStack())})
        if (number === 0) {
            throw Error('Cannot be 0')
        }
        ...
    }, { functionId: { name: 'thisFailsSometimes' }})
}

// Results in a metric: { theCallStack: 'outerB:thisFailsSometimes', result: 'Failed' }
// { theCallStack: 'outerB:thisFailsSometimes' } implies 'outerB' was run first, then 'thisFailsSometimes'. See docstrings for more info.
outerB()
```

### Important Notes

-   If a nested function does not use a `run()` then it will not be part of the call stack.

    ```typescript
    function a() {
        return telemetry.my_Metric.run(() => b(), { functionId: { name: 'a' } })
    }

    function b() {
        return c()
    }

    function c() {
        return telemetry.my_Metric.run(() => asStringifiedStack(telemetry.getFunctionStack()), {
            functionId: { name: 'c' },
        })
    }

    c() // result: 'a:c', note that 'b' is not included
    ```

-   If you are using `run()` with a class method, you can also add the class to the entry for more context

    ```typescript
    class A {
        a() {
            return telemetry.my_Metric.run(() => this.b(), { functionId: { name: 'a', class: 'A' } })
        }

        b() {
            return telemetry.my_Metric.run(() => asStringifiedStack(telemetry.getFunctionStack()), {
                functionId: { name: 'b', class: 'A' },
            })
        }
    }

    const inst = new A()
    inst.a() // 'A#a,b'
    ```

-   If you do not want your `run()` to emit telemetry, set `emit: false` in the options

    ```typescript
    function a() {
        return telemetry.my_Metric.run(() => b(), { functionId: { name: 'a' }, emit: false })
    }
    ```

-   If you want to add to the function stack, but don't have a specific metric to use,
    use the metric named `function_call`. Also look to set `emit: false` if you do not
    want it to emit telemetry.

    ```typescript
    function a() {
        return telemetry.function_call.run(() => b(), { functionId: { name: 'a' }, emit: false })
    }
    ```

-   If your function name is generic, look to make it unique so there is no confusion.

    ```typescript
    function a() {
        return telemetry.my_Metric.run(() => b(), { functionId: { name: 'aButMoreUnique' } })
    }
    ```

## Tracing Telemetry Events

All telemetry events include a traceId in addition to other attributes. Traceids allow for improved tracking and correlation of related events across a single operation or user flow.

### What is a traceId?

A traceId is a unique identifier that is generated for the top-level telemetry event in a flow and then propagated to all subsequent related events. This allows us to group and analyze all events associated with a particular operation.

### How it works

1. When a top-level telemetry event is created (e.g., `vscode_executeCommand`), a new traceId is generated.
2. This traceId is then attached to all subsequent related telemetry events that occur as part of the same operation or flow.
3. The traceId remains consistent for all events within the same flow

### Example

Consider a flow where `vscode_executeCommand` triggers `amazonq_enterFocusChat` and `amazonq_openChat`. The resulting telemetry events would look like this:

```
vscode_executeCommand:
traceId: 'aaaaa-aaaaa-aaaaa-aaaaa-aaaaa'

amazonq_enterFocusChat
traceId: 'aaaaa-aaaaa-aaaaa-aaaaa-aaaaa'

amazonq_openChat
traceId: 'aaaaa-aaaaa-aaaaa-aaaaa-aaaaa'
```

allowing us to look up `traceId=aaaaa-aaaaa-aaaaa-aaaaa-aaaaa` in our telemetry instance and find all the related events.

For more information visit the OpenTelemetry documentation on traces: https://opentelemetry.io/docs/concepts/signals/traces/

### Manual Trace ID Instrumentation

In certain scenarios you may need to manually instrument disjoint flows to track how a `traceId` propagates through them. e.g.

1. Measuring the time it takes for a message to travel from Amazon Q chat, through VS Code, and back to the customer.
2. Determining the duration for Amazon Q inline to display a message to the user.

In these cases, where there isn't a direct hierarchy of function calls, manual instrumentation of the `traceId` is necessary.

#### Implementation Options

#### 1. When not currently running in a span

If you're not within an active span and you know the `traceId` you want to use:

```javascript
telemetry.withTraceId(() => {
    // Code to be executed within this trace
}, 'myTraceId')
```

This method wraps the provided function with the specified traceId

#### 2. When currently running in a span

If you're already executing within a span (e.g., vscode_executeCommand) and you know the traceId you want to use:

```javascript
telemetry.record({
    traceId: 'myTraceId',
})
```

This approach records the traceId for the current span and all future spans within the same execution context.
