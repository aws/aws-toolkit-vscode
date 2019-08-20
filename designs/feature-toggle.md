Feature Toggle for Unreleased Features
==============================================

What is the problem?
--------------------

Currently, we cannot push large WIP features to the `master` branch as new builds will include unfinished code. Additionally, development in separate, isolated feature branches cause massive merges resulting in days of work to remedy. A feature toggle system will let us develop code and push it to the `master` branch as it's written, while hiding the functionality from the general populace.

What will be added?
---------------------

We will add a feature toggle class to the codebase which will allow developers to gate off code paths and allow easily-configurable access to users.

### Success criteria for the addition

* A feature toggle system that grants access to unreleased code for development purposes.
  * Returns a boolean value with whether or not the requested feature is accessible.
  * Access should not be dependent on a rebuild--this should be user-configurable through the IDE.
    * Waiting until a VS Code restart to grant access is acceptable.
  * Flags should be undocumented outside the codebase. Even though features will be included in new builds, they will eminently not be ready for general use.
    * Within the codebase, an enum should be used to define features in order to track down gates for easy removal when it's time to publish the feature.
  * Tests should be able to inject their own configurations into the feature toggle system to ensure correct features are tested.
  * A hard limit on the amount of active feature flags should be imposed in order to protect against bloat.

### Out-of-Scope

* Feedback to tell a user that their `settings.json` features array has changed and that they should restart to see changes
* The ability to toggle features on and off mid-session
* The ability to pass non-boolean values through feature toggle.
* The ability to permanently override the switch for the feature (as opposed to pruning the toggle and the forking code) when a feature is set to go live.
* Mechanisms to purge or otherwise expire old flags.

User Experience Walkthrough
---------------------------

Developers will be able to gate access to their code with a function. If a corresponding setting is added to the VS Code `settings.json` file, a user will have access to the gated code. This code will then be usable as normal, with no indications that the code is not intended for general use.

Implementation
--------------

### Design

FeatureToggle will be initialized on plugin activation in the `extension.ts:activate()` function. This provides a few things:

* The use of the initialized `DefaultSettingsConfiguration` object, which is also initialized in `activate()`
  * This can be initialized elsewhere, but this sticks to the idea of a session-permanent flag. Ad-hoc initialization is used by tests.
* The ability to pass the feature toggle object to other objects.

The FeatureToggle object will essentially wrap the SettingsConfiguration object. This wrapping will provide the following:

* Consistent assessment of features; initializing the FeatureToggle object will lock in the initial values for features.
* An enforced boolean return. Pulling from the VS Code `settings.json` file does not enforce any types.

The FeatureToggle file will also export an enum with the possible flag names. This enum will be size-restricted to 5 entries to prevent feature bloat. This can be used throughout the rest of the codebase to keep consistent feature names.

```typescript
export enum ActiveFeatureKeys {
    // note: the key and value for the enum need to match
    NewFeature1 = 'NewFeature1'
}
```

Feature access will be granted by passing the initialized FeatureToggle object down from the extension activation. Code can then be gated with code similar to the following:

```typescript
if (featureToggle.isFeatureActive(ActiveFeatureKeys.NewFeature1)) {
    newCodePath()
}
```

A developer will then gain access to the feature by opening their VS Code `settings.json` file and adding the following setting:

```javascript
{
    ...
    "aws.experimentalFeatureFlags": [
        ...,
        "NewFeature1",
        ...,
    ],
    ...
}
```

### Unit Tests

We will test the following scenarios:

* returns true if feature is declared active and is present in settings.json
* returns false for features that are not declared as active feature keys but are present in settings.json
* returns false for features that are declared as active feature keys but are not active in settings.json
* throws an error if too many features are registered
* For each feature that is currently added to the ActiveFeatureKeys enum:
  * returns true for currently-active feature: ${featureFlag}

Considerations
--------------

* Should we provide an option to permanently toggle a feature on?
  * No. If a feature is to be presented to all customers (instead of requiring an opt-in), it should not be wrapped by a feature.
* Should we use "expiration dates" for individual features?
  * No. This will add complexity and can at worst completely pause new development. Furthermore, reverting code or using old builds will cause issues with old feature flag expiration dates. We will instead provide a limit on how many feature flags we can have in the codebase at a time--this will ensure we clean up in a timely manner and not rely on the feature flagging system for non-experimental feature work.
* Should we provide a class with a function per feature so we can track features easier through the codebase?
  * No (at least in this iteration). Enums work in a similar capacity (with a search all instead of a symbol search) and allow for fewer touch points in the codebase (new flags are an addition to the enum instead of a brand new function)
* Should flags be able to pass non-boolean values?
  * No. User can add additional non-flag settings through the settings.json file as usual, though.
