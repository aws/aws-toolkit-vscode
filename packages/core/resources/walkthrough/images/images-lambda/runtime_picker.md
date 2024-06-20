<checklist>
	<div class="theme-picker-row">
		<checkbox when-checked="command:aws.toolkit.setWalkthroughRuntimeToPython" checked-on="walkthroughRuntime == 'Python'">
			<img width="200" src="./Python.png"/>
			Python
		</checkbox>
		<checkbox when-checked="command:aws.toolkit.setWalkthroughRuntimeToNode" checked-on="walkthroughRuntime == 'Node'">
			<img width="200" src="./node.png"/>
			Node JS
		</checkbox>
	</div>
</checklist>
<checkbox class="theme-picker-link" when-checked="command:aws.lambda.createNewSamApp" checked-on="false">
	See more application example...
</checkbox>
