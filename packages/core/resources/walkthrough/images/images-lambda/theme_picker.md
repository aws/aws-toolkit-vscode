<checklist>
	<div class="theme-picker-row">
		<checkbox when-checked="command:aws.toolkit.setWalkthroughToAPI" checked-on="walkthroughSelected == 'API'">
			<img width="200" src="./API.png"/>
			Rest API
		</checkbox>
		<checkbox when-checked="command:aws.toolkit.setWalkthroughToS3" checked-on="walkthroughSelected == 'S3'">
			<img width="200" src="./S3.png"/>
			S3
		</checkbox>
	</div>
</checklist>
<checkbox class="theme-picker-link" when-checked="command:aws.lambda.createNewSamApp" checked-on="false">
	See more application example...
</checkbox>
