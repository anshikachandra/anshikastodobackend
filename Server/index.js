// Minimal, robust server that supports MongoDB when configured, otherwise uses an in-memory store
const express = require('express')
const cors = require('cors')
const mongoose = require('mongoose')
require('dotenv').config()

const TodoModel = require('./Models/Todo')

const app = express()
app.use(cors())
app.use(express.json())

// In-memory fallback store if no MongoDB connection is configured.
let inMemoryTodos = []
let useDb = false

const start = async () => {
    const mongoURI = process.env.MONGO_URI
    if (mongoURI) {
        try {
            await mongoose.connect(mongoURI)
            console.log('Connected to MongoDB')
            useDb = true
        } catch (err) {
            console.error('Failed to connect to MongoDB, falling back to in-memory store', err.message)
            useDb = false
        }
    } else {
        console.log('No MONGO_URI provided — using in-memory store')
    }

    // GET /get - return all todos
    app.get('/get', async (req, res) => {
        try {
            if (useDb) {
                const todos = await TodoModel.find().lean()
                return res.json(todos)
            }
            return res.json(inMemoryTodos)
        } catch (err) {
            console.error('Error in GET /get', err)
            res.status(500).json({ error: 'Internal Server Error' })
        }
    })

    // POST /add - add a todo
    app.post('/add', async (req, res) => {
        try {
            const { task, priority } = req.body
            if (!task || !String(task).trim()) return res.status(400).json({ error: 'task is required' })
            // normalize incoming priority to lowercase when possible
            const incoming = priority === undefined ? undefined : String(priority).toLowerCase()
            const pr = (incoming && ['low','medium','high'].includes(incoming)) ? incoming : 'medium'
            if (useDb) {
                // create then re-fetch to ensure defaults and saved fields are returned consistently
                const created = await TodoModel.create({ task: String(task).trim(), priority: pr })
                const fetched = await TodoModel.findById(created._id).lean()
                // ensure priority is present on response
                if (fetched) return res.json(fetched)
                return res.json(created)
            }
            const newTodo = { _id: String(Date.now()), task: String(task).trim(), priority: pr }
            inMemoryTodos.push(newTodo)
            return res.json(newTodo)
        } catch (err) {
            console.error('Error in POST /add', err)
            res.status(500).json({ error: 'Internal Server Error' })
        }
    })

    // DELETE /delete/:id - remove a todo by id
    app.delete('/delete/:id', async (req, res) => {
        try {
            const { id } = req.params
            if (!id) return res.status(400).json({ error: 'id required' })
            if (useDb) {
                const removed = await TodoModel.findByIdAndDelete(id)
                if (!removed) return res.status(404).json({ error: 'Not found' })
                return res.json({ success: true })
            }
            const before = inMemoryTodos.length
            inMemoryTodos = inMemoryTodos.filter(t => t._id !== id && String(t._id) !== String(id))
            if (inMemoryTodos.length === before) return res.status(404).json({ error: 'Not found' })
            return res.json({ success: true })
        } catch (err) {
            console.error('Error in DELETE /delete/:id', err)
            res.status(500).json({ error: 'Internal Server Error' })
        }
    })

    // PATCH /update/:id - update a todo (task text or completed flag)
    app.patch('/update/:id', async (req, res) => {
        try {
            const { id } = req.params
            const update = {}
            if (req.body.task !== undefined) update.task = String(req.body.task).trim()
            if (req.body.completed !== undefined) update.completed = !!req.body.completed
            if (req.body.priority !== undefined) {
                const p = String(req.body.priority).toLowerCase()
                if (['low','medium','high'].includes(p)) update.priority = p
            }

            if (Object.keys(update).length === 0) return res.status(400).json({ error: 'nothing to update' })

            if (useDb) {
                const updated = await TodoModel.findByIdAndUpdate(id, update, { new: true })
                if (!updated) return res.status(404).json({ error: 'Not found' })
                return res.json(updated)
            }

            let found = false
            inMemoryTodos = inMemoryTodos.map(t => {
                if (String(t._id) === String(id)) {
                    found = true
                    return Object.assign({}, t, update)
                }
                return t
            })
            if (!found) return res.status(404).json({ error: 'Not found' })
            const todo = inMemoryTodos.find(t => String(t._id) === String(id))
            return res.json(todo)
        } catch (err) {
            console.error('Error in PATCH /update/:id', err)
            res.status(500).json({ error: 'Internal Server Error' })
        }
    })

    const port = process.env.PORT || 3001
    // Serve client build in production if present
    if (process.env.NODE_ENV === 'production'){
        const path = require('path')
        const clientDist = path.join(__dirname, '..', 'todolist', 'dist')
        app.use(express.static(clientDist))
        // Serve index.html for any unknown routes (SPA)
        app.get('*', (req, res) => {
            res.sendFile(path.join(clientDist, 'index.html'))
        })
    }

    // Optionally start HTTPS if certs exist or USE_HTTPS=true
    const fs = require('fs')
    const https = require('https')
    const certDir = require('path').join(__dirname, '..', 'certs')
    const keyPath = require('path').join(certDir, 'localhost-key.pem')
    const certPath = require('path').join(certDir, 'localhost.pem')

    if ((process.env.USE_HTTPS === 'true' || (fs.existsSync(keyPath) && fs.existsSync(certPath)))){
        try {
            const key = fs.readFileSync(keyPath)
            const cert = fs.readFileSync(certPath)
            https.createServer({ key, cert }, app).listen(port, () => {
                console.log(`HTTPS Server listening on https://localhost:${port}`)
            })
            return
        } catch (err) {
            console.error('Failed to start HTTPS server, falling back to HTTP', err)
        }
    }

    app.listen(port, () => console.log(`Server listening on http://localhost:${port}`))
}

start()