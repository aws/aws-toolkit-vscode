# Auth Forms

These are the components which the user will interact with and enter the necessary
auth data.

## General Design

Each form can have multiple states, where upon a certain action the content
of the form changes. Eg: Builder ID first requires the user to click a 'sign in'
button, then the next state requires them to copy the code, ...

Each Vue component should be designed to be able to resolve
any state of the form through a prop. Eg: If I pass a certain prop
value, the component will know to render in 'sign in' state for
Builder ID. If I pass a 'copy code' prop value, it will know to
render the 'copy code' state
