const mongoose=require('mongoose');

const RoomsSchema=new mongoose.Schema({
    name:{
        unique: true,
        type:String,
       
    },
    createdDate:String,
    createdTime:String,
    Members:[{
       type:String, 
    }],
});

const Rooms=mongoose.model('Rooms',RoomsSchema);
module.exports=Rooms;