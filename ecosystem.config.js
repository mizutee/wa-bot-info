module.exports = {
  apps : [{
    name   : "bot",
    script : "./app.js",
	env: {
		PORT: 80,
		MONGO_URL:"mongodb+srv://chrisansenw96:chrisansenw96@growtopia.xpqltzt.mongodb.net/?retryWrites=true&w=majority&appName=Growtopia"
	}
  }]
}
