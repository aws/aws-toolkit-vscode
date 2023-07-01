# Auth Forms

These are the components which the user will interact with and enter the necessary
auth data.

## General Design

Each auth form component utilizes an underlying state class which keeps
track of the data. The state class can then be used elsewhere to retrieve
the latest information about that auth method, these class instances can
be found in [shared.vue](./shared.vue).
