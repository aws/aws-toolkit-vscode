# Telemetry

See [aws-toolkit-common/telemetry](https://github.com/aws/aws-toolkit-common/tree/main/telemetry#telemetry) for full details about defining telemetry metrics.

-   You can define new metrics during development by adding items to
    [telemetry/vscodeTelemetry.json](https://github.com/aws/aws-toolkit-vscode/blob/21ca0fca26d677f105caef81de2638b2e4796804/src/shared/telemetry/vscodeTelemetry.json).
    -   Building the project will trigger the `generateClients` build task, which generates new symbols in `shared/telemetry/telemetry`, which you can import via:
        ```
        import { telemetry } from '../../shared/telemetry/telemetry'
        ```
    -   The metrics defined in `vscodeTelemetry.json` should be upstreamed to [aws-toolkit-common](https://github.com/aws/aws-toolkit-common/blob/main/telemetry/definitions/commonDefinitions.json) after launch (at the latest).
-   Metrics are dropped (not posted to the service) if the extension is running in [CI or other
    automation tasks](https://github.com/aws/aws-toolkit-vscode/blob/21ca0fca26d677f105caef81de2638b2e4796804/src/shared/vscode/env.ts#L71-L73).
    -   You can always _test_ telemetry via [assertTelemetry()](https://github.com/aws/aws-toolkit-vscode/blob/21ca0fca26d677f105caef81de2638b2e4796804/src/test/testUtil.ts#L164), regardless of the current environment.

### Incrementally Building a Metric

In certain scenarios, you may have some code that has multiple stages/steps in its execution.

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

Here we emitted a final metric based on the failure or success of the entire execution.

<br>

But usually code is not flat and there are many nested calls. If something goes wrong during the execution it would be useful to have more specific information at the area of failure. So what we can do is use `run()` along with `record()`.

`run()` takes in a callable, and when the callable is executed, any uses of `record()` within that callable will update the
attributes of the specific metric. And at the end we will emit a single metric with the last updated attributes.

For example:

```typescript
setupThing()

function setupThing() {
    // Start the run() for metric_setupThing
    telemetry.metric_setupThing.run(span => {
        // Update the metric with initial attributes
        span.record({result: 'Failed', reason: 'This is the start so it is not successful yet'})
        ...
        setupStep2()
        ...
        // Update the metric with the final success attributes since it made it to the end
        span.record({result: 'Succeeded', ...})
    })
    // At this point the final values from the `record()` calls are used to emit a the final metric
}

function setupStep2() {
    try {
        // do work
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
            reason: 'Something failed in setupStep2()'
        })
    }
}
```

<br>

Finally, if `setupStep2()` was the thing that failed we would see a metric like:

```
{
    "metadata.metricName": "metric_setupThing",
    "result": "Failed",
    "reason": "Something failed in setupStep2()",
    ...
}
```
