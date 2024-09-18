# 👋 Hello developer!

This is a great beginner e-commerce platform with a seamless integration of Stripe for secure and efficient payments, as well as an automatic email service for added customer convenience. It comes with a fully developed sign up and my page feature with order history. You add products easily with the `Manage Products` UI, and it is ready to go. Overall, the well-designed template of the webshop serves as an excellent starting point for programmers, providing them with a solid foundation for building a successful and user-friendly e-commerce site.

This project serves as an example of what can be achieved. It is not a fully functional product. Feel free to use the source code and ideas as a starting point for your own projects.

This is only one of the many templates available from W3Schools. Check our [tutorials for frontend development](https://www.w3schools.com/where_to_start.asp) to learn the basics of [HTML](https://www.w3schools.com/html/default.asp), [CSS](https://www.w3schools.com/css/default.asp) and [JavaScript](https://www.w3schools.com/js/default.asp). 🦄

## Knowledge requirements

To be able to fully understand and modify this template to your needs, there are several things you should know (or learn):

- [HTML](https://www.w3schools.com/html/default.asp)
- [CSS](https://www.w3schools.com/css/default.asp)
- [JavaScript](https://www.w3schools.com/js/default.asp)
- [Node.js](https://www.w3schools.com/nodejs/default.asp)
- [Express.js](https://expressjs.com/)
- [EJS](https://ejs.co/)
- [SQLite](https://www.sqlite.org/docs.html)
- [Google reCAPTCHA v3](https://developers.google.com/recaptcha/docs/v3)
- [Stripe](https://stripe.com/docs/api)

Useful resources
- [Mailtrap](https://mailtrap.io/)

## Warning - environment variables

Do not change SQLITE_DB and SESSION_SECRET as these are generated. If you change any of these the space will not behave as predicted.

## 🔨 What's next?

Customize this template to make it your own.  
Remember to make your layout responsive - if you want your site to look good on smaller screens like mobile.

## 🎨 Where to find everything?

This template is made by using several technologies.  
Below are explanations about where to find specific code.

**Environment variables**
You can access the environment variables in the settings by clicking on the gear icon in the upper right corner. 
**Please note:** These settings may not be available on mobile devices. To access them, it is recommended to enable desktop mode in your browser settings.

Public resources are found in the folder `public`.

Data is stored in your admin console.

The file structure of this template is designed to be organized and easy to navigate. It includes a larger number of folders compared to other templates, which allows for a clear separation of different components and functions. This organization makes it simple for both the developer to locate specific files and for the logic of the application to reference and import those files. It is suggested to maintain this structure for optimal functionality and ease of use, but ultimately the structure can be modified to suit individual preferences.

HTML files are stored in a folder called views. Files have `.ejs` extension, indicating it is [Embedded JavaScript templates](https://ejs.co/).
The folder `views/includes/` is made for smaller components you can use on multiple pages such as the head. In `views/includes/head.ejs` you can put metadata that is needed on every page. Single page files are structured in folders under `/views`.

### Core files
  - styling in `public/css`
  - frontend logic in `public/js/`
  - database logic in `database/sqlite.js`
  - API routes in `routes/` linked to controllers in `controllers/`
  - utility functions in `util/`


## Google reCAPTCHA v3

In order to make use of this template, it is necessary to generate your own SITE key and SECRET key for Google reCAPTCHA and integrate them into the template.

To do so, it is recommended to first familiarize yourself with the [Google reCAPTCHA v3 documentation](https://developers.google.com/recaptcha/docs/v3). 
Next, access the [Google reCAPTCHA admin site](https://www.google.com/recaptcha/admin). Here, you may be prompted to log in if you have not done so previously.

#### Label

The label serves as a name or alias for your set of keys.

#### reCAPTCHA Type

Choose "reCAPTCHA v3" from the options. This version is considered to be the most current and effective.

#### Domains

Enter your website domain, for example: `your-space-id.w3spaces.com`.

#### Form Submission

Read and accept the reCAPTCHA Terms of Service and submit the form.
Once the form is submitted, you should be able to view your set of keys, which should then be added to your project.

#### Key Integration

Access the settings by clicking on the gear icon in the upper right corner. 
**Please note:** These settings are not be available on mobile devices. To access them, you need to enable desktop mode in your browser settings.
In the Environment tab, update the values for `RECAPTCHA_SECRET_KEY` and `RECAPTCHA_SITE_KEY`.

If you wish to deactivate reCAPTCHA for any reason, you are free to do so. However, it will be necessary to make changes to the following files:
- `routes/auth.js`
- `controller/auth.js`
- Views for login, signup and head.
  
## Enter in administration

Administration and user login have the same route. `https://domain.w3spaces.com/login`
Admin user is made by a `seeder.js` in the root folder. Here you can find the default generated password and username.

## Stripe and SMTP provider(for sending emails)

### Stripe
- You will need a Stripe account to get authorization keys to use the API. 
- Fill out the environment variables `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` with your obtained keys after making an account. Read more about keys here: `https://stripe.com/docs/keys` while logged in. For live mode you have to activate your account.
- Set up webhooks. See `https://dashboard.stripe.com/test/webhooks`. 

### SMTP
You need an automatic email provider to send order emails, receipts etc. In this template we have set up `nodemailer` that use environment variables to send emails. 
These are e.g.:
- EMAIL_HOST=example.smtp.mailtrap.io
- EMAIL_PORT=2525
- EMAIL_AUTH_USER=examplekey-a1b2c3d4e5f6g7
- EMAIL_AUTH_PASS=examplekey-a1b2c3d4e5f6g7
- EMAIL_FROM=default-email-address@test-service.com

This is a Mailtrap example. You find this information by clicking your inbox under `Email Testing`. You will automatically be directed to `SMTP Settings` and then you can click `Show credentials` to reveal the relevant information.

## Custom administration scripts:
- `admin:createadminuser`
  - This creates an admin account. There are no limits to number of accounts.

- `admin:deleteadminuser`
  - This deletes an admin account.

To run any of these scripts, type in the terminal `npm run SCRIPT_NAME`

## Database

Dynamic spaces can use [SQLite](https://www.sqlite.org/docs.html) database.  
The database file is called `database.db`. It is placed inside the `w3s-dynamic-storage` folder.  
SQLite connection path to the database is `w3s-dynamic-storage/database.db` which you can use to connect to the SQLite database programmatically.   
For this template, the database connection path can also be found in the environment. 
Database creation and queries can be found in `database/sqlite.js`.

---  
**Do not change the `w3s-dynamic-storage` folder name or `database.db` file name!**  
**By changing the `w3s-dynamic-storage` folder name or `database.db` file name, you risk the space not working properly.**
## 🔨 Please note
For now files created/uploaded or edited from within the terminal view will not be backed up or synced. 

## ⛑ Need support?
[Join our Discord community](https://discord.gg/6Z7UaRbUQM) and ask questions in the **#spaces-general** channel to get your space on the next level.  
[Send us a ticket](https://support.w3schools.com/hc/en-gb) if you have any technical issues with Spaces.

Happy learning!