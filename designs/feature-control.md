Feature Access Control for Unreleased Features
====================================

What is the problem?
--------------------

Currently, we cannot push large WIP features to the `master` branch as new builds will include unfinished code. Additionally, development in separate, isolated feature branches cause massive merges resulting in days of work to remedy. A feature access control system will let us develop code and push it to the `master` branch as it's written, while hiding the functionality from the general populace.

What will be added?
---------------------

We will add a feature access control class to the codebase which will allow developers to gate off code paths and allow easily-configurable access to users.

### Success criteria for the addition

* A feature access control system that grants access to unreleased code for development purposes.
  * Access should not be dependent on a rebuild--this should be user-configurable.
  * Flags should be undocumented outside the codebase. Even though features will be included in new builds, they will eminently not be ready for general use.
  * Individual features should be able to be toggled on/off on-the-fly or only on restart ("session-permanent") in a predictable manner.
  * Tests should be able to inject their own configurations into the feature access control system to ensure correct features are tested.

### Out-of-Scope

* Visual confirmation for a user to discern whether or not a feature is session-permanent when adding a toggle to their `settings.json` file while the extension is running.
* The ability to pass non-boolean values through feature access control.
* The ability to permanently override the switch for the feature (as opposed to pruning the toggle and the forking code) when a feature is set to go live.

User Experience Walkthrough
---------------------------

Developers will be able to gate access to their code with a function. If a corresponding setting is added to the VS Code `settings.json` file, a user will have access to the gated code. This code will then be usable as normal, with no indications that the code is not intended for general use.

Implementation
--------------

### Design

FeatureAccessControl will be initialized on plugin activation in the `extension.ts:activate()` function. This provides a few things:

* The use of the initialized `DefaultSettingsConfiguration` object, which is also initialized in `activate()`
* The ability to pass the feature access control object to other objects
* The ability to lock in session-permanent features as the session is starting.

The FeatureAccessControl object will essentially wrap the SettingsConfiguration object. This wrapping will provide the following:

* A defined list of session-permanent features.
* Consistent assessment of session-permanent features; initializing the FeatureAccessControl object will lock in the initial values for session-permanent features.
* On-the-fly assessment of non session-permanent features.
* An enforced boolean return. Pulling from the VS Code `settings.json` file does not enforce any types.
* A standard naming convention for feature toggles: searching for feature `featureName` will always correspond to the setting `aws.toggle.featureName`.

Feature access will be granted by passing the initialized FeatureAccessControl object down from the extension activation. Code can then be gated with code similar to the following:

``` typescript
if (featureController.isFeatureActive('myFeature')) {
    newCodePath()
}
```

A developer will then gain access to the feature by opening their VS Code `settings.json` file and adding the following setting:

```javascript
{
    ...
    "aws.toggle.myFeature": true
    ...
}
```

If the developer wants to make the feature session-permanent, they will add the `myFeature` key to an array in the FeatureAccessControl object.

### Unit Tests

We will test the following scenarios:

* returns true if feature is active
* returns false if feature is inactive
* returns true if feature is a non-boolean but truthy value
* returns false if feature is a non-boolean but falsy value
* returns false for features that are not present
* returns the current value of non-session-permanent features
* returns the current value of non-session-permanent features that are not present at launch but later set
* returns only the initial value of session-permanent features
* returns false for session-permanent features that are not present
* returns false for session-permanent features that are not present at launch but changed mid-lifecycle
