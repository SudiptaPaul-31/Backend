const mongoose = require('mongoose');

mongoose.connect(`mongodb://127.0.0.1:27017/mongopractice`)

const userSchema = mongoose.Schema({
    name: String,
    username: String,
    email: String,
}) // Schema means user details

module.exports = mongoose.model('user', userSchema);