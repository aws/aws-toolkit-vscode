# Executable Extension Point

The toolkit relies on external CLI's to provide common functionality - this pattern has been adopted
to avoid duplicate work across multiple IDE integrations.

The classic example is the SAM CLI which provides the majority of the toolkit's serverless functionality.

## Common Features

Each CLI/Executable that the toolkit integrates with will have several common features and thus it makes
sense to create an extension-point abstraction to ease adding new CLIs in the future.

Features that each CLI will require:
* An ability to for the customer to configure the path/location of the executable
  * Persistence of this setting
* An ability for parts of the toolkit to be able to determine said path

A CLI may also be able to 
* Automatically resolve the path of the executable for the customer (e.g. find it locally, or resolve it from some remote location)
* Determine if the executable is valid (e.g. can be executed, is a valid version etc)
* Surface version information

These optional features will be determined based on a set of mix-in interfaces.

## Executable Types
A new extension-point `ExecutableType` will be the mechanism to add new available executables to the toolkit. These types will define their
`id`, versioning strategy as well as optionally a way to resolve and validate them.

```kt
interface ExecutableType<VersionScheme> {
    val id: String
    val displayName: String

    /**
     * Determine the version number of the given path
     */
    fun version(path: Path): CompletionStage<VersionScheme>
}

interface AutoResolvable {

    /**
     * Attempt to automatically resolve the path
     *
     * @return the resolved path or null if not found
     * @throws if an exception occurred attempting to resolve the path, when success was expected
     */
    fun resolve(): Path?
}

interface Validatable {

    /**
     * Validate the executable at the given path, this may include version checks
     * or any other validation required to ensure this executable is compatible with
     * the toolkit.
     *
     * If validation fails throw exception, [Exception.message] is displayed to the user
     */
    fun validate(path: Path)
}
```

Registering a new `ExecutableType` will require a `plugin.xml` entry :

```xml
<executableType implementation="software.aws.toolkits.jetbrains.core.executables.SamExecutable"/>
```

## Usage of Executables
The management, validation, and resolution of executables will be managed in a central location. The `ExecutableManager` will expose
methods that allow the resolution of an executable path and will return types that express the state of that executable.

### Possible States
A defined executable may have one of several states:
* **Resolved** the toolkit has a path to an executable, and it is valid (in the case the `ExecutableType` has specified a validation mechanism)
* **Unresolved** the toolkit doesn't have a current local path at which the executable resides, and is either unable to automatically resolve
or the automated resolution has failed.
* **Invalid** the toolkit has a path to the executable, but the path has been deemed invalid (e.g. incorrect version, wrong permissions etc).

These states are conveyed as a `sealed class`:

```kt

sealed class ExecutableInstance {
    class Executable(val executablePath: Path) : ExecutableInstance(), ExecutableWithPath
    class InvalidExecutable(val executablePath: Path, val validationError: String) : ExecutableInstance(), ExecutableWithPath, BadExecutable
    class UnresolvedExecutable(val validationError: String) : ExecutableInstance(), BadExecutable
}
```

Each one of the classes in the `sealed class` implement at least one of these interfaces:
```kt
interface ExecutableWithPath {
    val executablePath: Path
    val autoResolved: Boolean
}

interface BadExecutable {
    val validationError: String
}

```

### Operations
```kt
interface ExecutableManager {
    fun getExecutable(type: ExecutableType<*>): CompletionStage<ExecutableInstance>
    fun getExecutableIfPresent(type: ExecutableType<*>): ExecutableInstance
    fun validateExecutablePath(type: ExecutableType<*>, path: Path): ExecutableInstance
    fun setExecutablePath(type: ExecutableType<*>, path: Path): CompletionStage<ExecutableInstance>
    fun removeExecutable(type: ExecutableType<*>)
}
```

The `ExecutableManager` exposes three methods that allow an executables path to be determined:
* **getExecutable** will asynchronously resolve the path and validate it (if the `ExecutableType` extends `AutoResolvable` and/or `Validatable`).
The result will be cached (with a timestamp of the file) and future calls will not require auto-resolution.
* **getExecutableIfPresent** a non-blocking call that will check if the `ExecutableType` has already been resolved and return it if it has; otherwise 
`ExecutableInstance.UnresolvedExecutable` is returned. *nb: no validation occurs as part of this call*
* **validateExecutablePath** is a  blocking call that will validate if the path passed in is a valid executable. It
will not mutate the state of the `ExecutableManager` and is most useful for UI code.

In addition the **setExecutablePath** method allows explicitly associating a `Path` with a given `type`. 

### Usage Example

When the executable is required in code (e.g. SAM Invoke) it can be used as follows:

```kt
val manager = ExecutableManager.getInstance()
when(val executable = manager.getExecutable<SamExecutable>()) {
  is ExecutableInstance.Executable -> doSomethingWithExecutable(executable.executablePath)
  is ExecutableInstance.InvalidExecutable -> surfaceErrorToUserAboutInvalidVersion(exectuable.validationError)
  is ExecutableInstance.UnresolvedExecutable -> promptCustomerToConfigure(executable.resolutionError)
}
```
