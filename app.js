const express = require('express');
const app = express();

const userModel = require('./usermodel');

app.get('/', (req, res) => {
    res.send("Hey")
});

//CRUD operations
app.get('/create', async (req, res) =>{
    let createduser = await userModel.create({
        name: 'Sudipta Paul',
        email: 'sudipta@gmail.com',
        username: 'sudipta'
    });

    res.send(createduser);
});

app.get('/read', async (req, res) =>{
    let users = await userModel.find();

    res.send(users);
});

app.get('/update', async (req, res) =>{
    let updateduser = await userModel.findOneAndUpdate({username: 'sudipta'}, {name:'sudi007'}, {new: true})
    
    res.send(updateduser);
});


app.get('/delete', async (req, res) =>{
    let users = await userModel.findOneAndDelete({username: 'sudipta'})

    res.send(users);
});

app.listen(3000);