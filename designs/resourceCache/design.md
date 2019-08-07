# AWS Resource Cache

List and describe calls to AWS services are used to fetch information about the resources 
available within a customers account. Typical examples are:
 - populate AWS explorer views
 - populate resource-selection drop-down boxes

In some cases the lifecycle of these describe calls is not controlled by the plugin but rather
the [IntelliJ SDK][1] - we don't control when this data is refreshed. An example is the [`LambdaLineMarker`][2] which implements [`LineMarkerProvider`][3],
the [`LineMarkerProvider.getLineMarkerInfo`][4]
is invoked repeatedly as a file is being edited to determine if a line marker should be shown.

AWS resources are rarely provisioned multiple times per second and network bandwidth on developer laptops as
well as AWS throttling limits makes repeatedly making list/describe calls for resources untenable. Clearly a cache
is required.

## Requirements

The resource cache has some unique requirements that make sense to implement in a re-usable way on-top of a
known in-memory caching implementation ([Guava][5]):
- Ability to cache a resource (or list of resources) by AWS [Region][6] / Account ([Credential][7])
- Time-based expiration, customizable by resource-type (some resources are more dynamic than others)
- The ability to fall-back to stale data in the event of a failed refresh (e.g. the developers machine is offline)
- Ability to force a refresh when we know a resource has changed
- Be respectful of a developer machines memory constraints

## Implementation
The following section describes the implementation of the [`AwsResourceCache`][8] 
inside the toolkit. The [`AwsResourceCache`][8] is a `Project` level service that exposes methods for fetching a 
resource (either from the cache or by making a network call), as well as methods for clearing existing cached resources
on a number of dimensions.

The cache also understands when credential providers have been mutated (by implementing `ToolkitCredentialsChangeListener`) this
automatically removes entries for that credential ID from the cache.

### Operations

#### `getResource`

```kt
fun <T> getResource(
    resource: Resource<T>,
    region: AwsRegion,
    credentialProvider: ToolkitCredentialsProvider,
    useStale: Boolean = true,
    forceFetch: Boolean = false
): CompletionStage<T>
```
This is the primary mechanism for resolving a resource, this is an asynchronous operation 
that returns a `CompletionStage` which is completed inside a pooled thread (`Application.executeOnPooledThread`). 

**Note:** The `CompletionStage` will always be completed inside a pooled thread for a couple of reasons:
* Consistency - consumers don't need have different logic for asynchronous vs blocking behavior
* Concurrency - the underlying cache is an implementation of `ConcurrentHashMap` and reads may have to acquire a 
lock if a refresh is in flight

The `Resource` includes the logic for how to fetch the resource to populate the cache 
(see [Resource Types](#resource-types)). Cached results have a compound key of `resource`, 
`region` and `credentialProvider`.

There are two optional parameters that control the cache's fetch behavior:
* `useStale`: (default `true`) Controls whether falling back to an expired value is valid for this call. When `true` (the default), if an expired value is found in the cache 
and the remote fetch failed, suppress the refresh failure and return the expired value.
* `forceFetch`: (default `false`) When `true`, ignore the cached version of a resource and attempt a refresh from the srouce, updating the cached value 
if the refresh was successful. In the event of a failure, respect the `useStale` value.

**Active Region/Credential Overload**
```kt
fun <T> getResource(
    resource: Resource<T>,
    useStale: Boolean = true,
    forceFetch: Boolean = false
): CompletionStage<T>
```
This is an overload that delegates to `getResource(Resource, AwsRegion, ToolkitCredentialsProvider)` using the currently active `region` 
and `credentialProvider` found in `ProjectAccountSettingsManager`.

**Blocking Overloads**

Some features of the toolkit require blocking API's as their asynchronicity is already handled elsewhere (e.g. the AWS explorer). These overloads
wrap the async API and wait for a certain `timeout` for the underlying `CompletionStage` to complete.

```kt
fun <T> getResourceNow(
    resource: Resource<T>,
    timeout: Duration = DEFAULT_TIMEOUT,
    useStale: Boolean = true,
    forceFetch: Boolean = false
): T 
```

```kt
fun <T> getResourceNow(
    resource: Resource<T>,
    region: AwsRegion,
    credentialProvider: ToolkitCredentialsProvider,
    timeout: Duration = DEFAULT_TIMEOUT,
    useStale: Boolean = true,
    forceFetch: Boolean = false
): T
```

Alternatively we may only want to retrieve the value if it is in the cache:

```kt
fun <T> getResourceIfPresent(
    resource: Resource<T>, 
    useStale: Boolean = true
): T?
```

```kt
fun <T> getResourceIfPresent(
    resource: Resource<T>, 
    region: AwsRegion, 
    credentialProvider: ToolkitCredentialsProvider, 
    useStale: Boolean = true
): T?
```

#### `clear`

The `clear` operation can occur at two levels of granularity. Either the whole cache can be cleared out (all resource types, regions and credentials) when calling the `clear()` method.

Alternatively clearing can happen on a resource by resource basis by calling `clear(Resource)`.

### Resource Types

Broadly there are several types of `Resource`, those that are sourced from a remote API call (`Resource.Cached`) and those that apply a transformation to another `Resource` before returning (`Resource.View`).

#### `Resource.Cached`
This is the basic building block, a low-level network call, whose result is stored in memory with a given expiry. Cached resources must implement the `fetch` 
method which (typically) will make a call to an AWS service.

Since the majority of `Cached` resources will depend on a single AWS service there is a helper implementation `ClientBackedCachedResource` 
where only the SDK client type and API call needs to be specified. Example:

```kt
ClientBackedCachedResource(LambdaClient::class) { 
    listFunctionsPaginator().functions().toList()
}
```

#### `Resource.View`
A `View` is an implementation of `Resource` that relies on another, underlying `Resource` to actually source the data. This "underlying" resource could 
also be a `View` or `Cached` resource. This allows multiple variations on the same underlying service data to be surfaced in a consistent way. As an example
the `ResourceSelector` simply needs to take a `Resource` type as a constructor parameter and all the caching, transformation and refresh logic can be abstracted.

The results of `View` transformations are *not* cached, so transformations should be relatively fast.

In addition to the `View` class, there are a number of helper *extension functions* that make it easier to create `Views` off `Collection` resources:

```kt
fun <Input, Output> Resource<out Iterable<Input>>.map(transform: (Input) -> Output): Resource<List<Output>>

fun <T> Resource<out Iterable<T>>.filter(predicate: (T) -> Boolean): Resource<List<T>>

fun <T> Resource<out Iterable<T>>.find(predicate: (T) -> Boolean): Resource<T?>
```

These make it easy to compose a single `Cached` resource into many different types of `View`:

```kt

val BASE_RESOURCE = ClientBackedCachedResource(LambdaClient::class) { 
    listFunctionsPaginator().functions().toList()
}

val filteredView: Resource<String?> = BASE_RESOURCE.filter { it.functionArn() > 5 }
  .map{ it.functionName() }
  .find { it == "foo" }
```

## Future Enhancements

### New `Resource` type `Resource.Compound`
In the future it might make sense to add a `Resource` type that both builds on an existing cached resource and makes additional network calls (and the 
result should be cached). A good use-case for this would be `LIST_BUCKETS_BY_REGION` which combines a `list-buckets` call with multiple `get-bucket-region` calls. In 
 the current design this resource would need to be implemented as it's own top-level `Cached` resource that makes both sets of calls. This potentially
 duplicates the storage of 'bucket lists' in the cache. 
 
 If a compound existed the `LIST_BUCKETS_BY_REGION` call could use a cached version of `list-buckets` and then make (and cache) the additional network
 calls to fill in the region information.
 
 This requires enhanced knowledge of the dependency graph to be built into the cache - expiry would no longer be associated to a single
 cached resource but be the combination of all dependent resources as well. 

[1]: https://www.jetbrains.org/intellij/sdk/docs/welcome.html
[2]: https://github.com/aws/aws-toolkit-jetbrains/blob/72ca1c96bb44955f06a729dfd41858179839efe7/jetbrains-core/src/software/aws/toolkits/jetbrains/services/lambda/upload/LambdaLineMarker.kt
[3]: https://github.com/JetBrains/intellij-community/blob/master/platform/lang-api/src/com/intellij/codeInsight/daemon/LineMarkerProvider.java
[4]: https://github.com/JetBrains/intellij-community/blob/master/platform/lang-api/src/com/intellij/codeInsight/daemon/LineMarkerProvider.java#L77
[5]: https://github.com/google/guava/wiki/CachesExplained
[6]: https://github.com/aws/aws-toolkit-jetbrains/blob/master/core/src/software/aws/toolkits/core/region/AwsRegion.kt
[7]: https://github.com/aws/aws-toolkit-jetbrains/blob/master/core/src/software/aws/toolkits/core/credentials/ToolkitCredentialsProvider.kt
[8]: https://github.com/aws/aws-toolkit-jetbrains/blob/master/jetbrains-core/src/software/aws/toolkits/jetbrains/core/AwsResourceCache.kt