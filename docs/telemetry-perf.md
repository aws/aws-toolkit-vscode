# Telemetry Performance Metrics

Visual representations of performance telemetry metrics

## Amazon Q Inline

### codewhispererFirstCompletionLatency

How long it took to receive the first suggestion after we started calling the getRecommendations API

```mermaid
    sequenceDiagram
        participant User
        participant invoke as Inline invoked
        participant rService as Recommendation Service
        participant rHandler as Recommendation Handler
        participant backend as CWSPR backend
        participant sdk as Create CWSPR SDK
        participant token as Toolkit auth


        User->>invoke: Finished typing
        invoke->>rService: calls
        rService->>rHandler: calls
        rHandler->>sdk: calls

        sdk->>token: Start getting bearer token
        token->>sdk: Finished getting bearer token

        sdk->>rHandler: Return client
        note over rHandler, backend: codewhispererFirstCompletionLatency
        rect rgb(230, 230, 230, 0.5)
        loop Get paginated recommendations
            rHandler->>backend: calls
        end
        backend->>rHandler: first response received
        end
        rHandler->>User: show results
        backend->>rHandler: all the other responses
        rHandler->>User: add to already shown results
```

### codewhispererEndToEndLatency

How long it took from when we started calling the getRecommendations API to when the first suggestion was shown

```mermaid
    sequenceDiagram
        participant User
        participant invoke as Inline invoked
        participant rService as Recommendation Service
        participant rHandler as Recommendation Handler
        participant backend as CWSPR backend
        participant sdk as Create CWSPR SDK
        participant token as Toolkit auth

        User->>invoke: Finished typing
        invoke->>rService: calls
        rService->>rHandler: calls
        rHandler->>sdk: calls

        sdk->>token: Start getting bearer token
        token->>sdk: Finished getting bearer token

        sdk->>rHandler: Return client
        note over User, backend: codewhispererEndToEndLatency
        rect rgb(230, 230, 230, 0.5)
            loop Get paginated recommendations
                rHandler->>backend: calls
            end
            backend->>rHandler: first response received
            rHandler->>User: show results
        end

        backend->>rHandler: all the other responses
        rHandler->>User: add to already shown results
```

### codewhispererAllCompletionsLatency

How long it took to complete all paginated calls

```mermaid
    sequenceDiagram
        participant User
        participant invoke as Inline invoked
        participant rService as Recommendation Service
        participant rHandler as Recommendation Handler
        participant backend as CWSPR backend
        participant sdk as Create CWSPR SDK
        participant token as Toolkit auth


        User->>invoke: Finished typing
        invoke->>rService: calls
        rService->>rHandler: calls
        rHandler->>sdk: calls

        sdk->>token: Start getting bearer token
        token->>sdk: Finished getting bearer token

        sdk->>rHandler: Return client
        note over User, backend: codewhispererAllCompletionsLatency
        rect rgb(230, 230, 230, 0.5)
            loop Get paginated recommendations
                rHandler->>backend: calls
            end
            backend->>rHandler: first response received
            rHandler->>User: show results
            backend->>rHandler: all the other responses
        end


        rHandler->>User: add to already shown results
```

### codewhispererPostprocessingLatency

How long it took to display the first suggestion after it received the first response from the API

```mermaid
    sequenceDiagram
        participant User
        participant invoke as Inline invoked
        participant rService as Recommendation Service
        participant rHandler as Recommendation Handler
        participant backend as CWSPR backend
        participant sdk as Create CWSPR SDK
        participant token as Toolkit auth


        User->>invoke: Finished typing
        invoke->>rService: calls
        rService->>rHandler: calls
        rHandler->>sdk: calls

        sdk->>token: Start getting bearer token
        token->>sdk: Finished getting bearer token

        sdk->>rHandler: Return client
        loop Get paginated recommendations
            rHandler->>backend: calls
        end
        note over User, backend: codewhispererPostprocessingLatency
        rect rgb(230, 230, 230, 0.5)
            backend->>rHandler: first response received
            rHandler->>User: show results
        end

        backend->>rHandler: all the other responses
        rHandler->>User: add to already shown results
```

### codewhispererCredentialFetchingLatency

How long it took to get the bearer token

```mermaid
    sequenceDiagram
        participant User
        participant invoke as Inline invoked
        participant rService as Recommendation Service
        participant rHandler as Recommendation Handler
        participant backend as CWSPR backend
        participant sdk as Create CWSPR SDK
        participant token as Toolkit auth

        User->>invoke: Finished typing
        invoke->>rService: calls
        rService->>rHandler: calls
        rHandler->>sdk: calls

        note over sdk, token: codewhispererCredentialFetchingLatency
        rect rgb(230, 230, 230, 0.5)
            sdk->>token: Start getting bearer token
            token->>sdk: Finished getting bearer token
        end
        sdk->>rHandler: Return client
        loop Get paginated recommendations
            rHandler->>backend: calls
        end

        backend->>rHandler: first response received
        rHandler->>User: show results

        backend->>rHandler: all the other responses
        rHandler->>User: add to already shown results
```

### codewhispererPreprocessingLatency

How long it took to create the client and get ready to start sending getRecommendation API calls

```mermaid
    sequenceDiagram
        participant User
        participant invoke as Inline invoked
        participant rService as Recommendation Service
        participant rHandler as Recommendation Handler
        participant backend as CWSPR backend
        participant sdk as Create CWSPR SDK
        participant token as Toolkit auth

        User->>invoke: Finished typing
        invoke->>rService: calls
        rService->>rHandler: calls
        rHandler->>sdk: calls

        note over rHandler, token: codewhispererPreprocessingLatency
        rect rgb(230, 230, 230, 0.5)
            sdk->>token: Start getting bearer token
            token->>sdk: Finished getting bearer token
            sdk->>rHandler: Return client
        end
        loop Get paginated recommendations
            rHandler->>backend: calls
        end

        backend->>rHandler: first response received
        rHandler->>User: show results

        backend->>rHandler: all the other responses
        rHandler->>User: add to already shown results
```

### codewhisperer_perceivedLatency duration

How long it took from when the user stopped pressing a key to when they were shown a response

```mermaid
    sequenceDiagram
        participant User
        participant invoke as Inline invoked
        participant rService as Recommendation Service
        participant rHandler as Recommendation Handler
        participant backend as CWSPR backend
        participant sdk as Create CWSPR SDK
        participant token as Toolkit auth

        User->>invoke: Finished typing
        note over User, token: codewhisperer_perceivedLatency duration
        rect rgb(230, 230, 230, 0.5)
        invoke->>rService: calls
        rService->>rHandler: calls
        rHandler->>sdk: calls
            sdk->>token: Start getting bearer token
            token->>sdk: Finished getting bearer token
            sdk->>rHandler: Return client

        loop Get paginated recommendations
            rHandler->>backend: calls
        end

        backend->>rHandler: first response received
        rHandler->>User: show results

        backend->>rHandler: all the other responses
        rHandler->>User: add to already shown results
        end
```

## Crash Monitoring

We make an attempt to gather information regarding when the IDE crashes, then report it to telemetry. This is the diagram of the steps that take place.

### Sequence Diagram

> Keep in mind that the entire sequence below is duplicated for each instance of our extension.
> They all work together to "crash check" on behalf of the other crashed extension instance.

`Crash Service`: The high level "service" that starts the heartbeats and crash checks

`Heartbeat`: Sends heartbeats which signal that the extension is still running and has not crashed

`Crash Checker`: Observes the heartbeats, reporting a telemetry event if a crash is detected

`File System State`: The user's file system where we store the heartbeat files from each extension instance

```mermaid
%%{init: {'theme':'default'}}%%
sequenceDiagram
  autonumber

  participant VSC as VS Code
  participant Service as Crash Service
  participant Checker as Crash Checker
  participant Heartbeat as Heartbeat
  participant State as File System State
  participant Telemetry as Telemetry

  rect rgb(121, 210, 121)
    alt Extension Startup
        VSC ->> Service: activate() - Start Monitoring

        Service ->> Heartbeat: Start Heartbeats
        Heartbeat ->> State: Send Initial Heartbeat <br/> (in a folder add a unique file w/ timestamp)
        rect rgb(64, 191, 64)
            par every N minutes
                Heartbeat ->> State: Send Heartbeat <br/> (overwrite the unique file w/ new timestamp)
            end
        end

        Service ->> Checker: Start Crash Checking
        rect rgb(64, 191, 64)
            par every N*2 minutes
                Checker ->> Checker: If computer went to sleep, skip this iteration (gives time for a heartbeat)
                Checker ->> State: Request all heartbeat timestamps (readdir all heartbeat files)
                State ->> Checker: Receive all heartbeat timestamps
                loop for each crashed extension (it's timestamp >= N*2 minutes)
                    Checker ->> State: Delete heartbeat file
                    Checker ->> Telemetry: Send metric representing a crash: session_end
                end
            end
        end
    end
  end

  rect rgb(255, 128, 128)
    alt Graceful Shutdown
        VSC ->> Service: deactivate() - Stop Monitoring
        Service ->> Checker: Stop
        Service ->> Heartbeat: Stop
        Heartbeat ->> State: Delete timestamp file <br/> (This is missed when a crash happens)
    end
  end

```
