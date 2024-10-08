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
