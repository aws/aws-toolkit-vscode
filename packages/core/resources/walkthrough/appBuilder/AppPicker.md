<checklist>
	<div class="theme-picker-row">
		<checkbox when-checked="command:aws.toolkit.lambda.setWalkthroughToAPI" checked-on="aws.toolkit.lambda.walkthroughSelected == 'API'">
			<img width="200" src="./AppPickerResource/API.png"/>
			Rest API
		</checkbox>
		<checkbox when-checked="command:aws.toolkit.lambda.setWalkthroughToS3" checked-on="aws.toolkit.lambda.walkthroughSelected == 'S3'">
			<img width="200" src="./AppPickerResource/S3.png"/>
			File processing
		</checkbox>
	</div>
	<div class="theme-picker-row">
		<checkbox when-checked="command:aws.toolkit.lambda.setWalkthroughToVisual" checked-on="aws.toolkit.lambda.walkthroughSelected == 'Visual'">
			<img width="200" src="./AppPickerResource/AppComposer.png"/>
			New template with visual builder
		</checkbox>
		<checkbox when-checked="command:aws.toolkit.lambda.setWalkthroughToCustomTemplate" checked-on="aws.toolkit.lambda.walkthroughSelected == 'CustomTemplate'">
			<img width="200" src="./AppPickerResource/CustomTemplate.png"/>
			Current workspace template
		</checkbox>
	</div>
</checklist>
<checkbox class="theme-picker-link" when-checked="command:aws.toolkit.lambda.createServerlessLandProject" checked-on="false">
	See more application example...
</checkbox>
