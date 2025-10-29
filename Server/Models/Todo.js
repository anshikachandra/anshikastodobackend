const mongoose = require('mongoose')

const TodoSchema = new mongoose.Schema({
    task: { type: String, required: true },
    completed: { type: Boolean, default: false },
    priority: { type: String, enum: ['low','medium','high'], default: 'medium' }
}, { timestamps: true })

const TodoModel = mongoose.model('Todo', TodoSchema)
module.exports = TodoModel