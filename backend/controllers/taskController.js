import Task from '../models/Task.js';

// @desc    Get all tasks
// @route   GET /api/tasks
// @access  Public
export const getTasks = async (req, res) => {
  try {
    const tasks = await Task.find({}).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: tasks.length, data: tasks });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server Error', message: error.message });
  }
};

// @desc    Get single task
// @route   GET /api/tasks/:id
// @access  Public
export const getTaskById = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    res.status(200).json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server Error', message: error.message });
  }
};

// @desc    Create a task
// @route   POST /api/tasks
// @access  Public
export const createTask = async (req, res) => {
  try {
    const { title, description, status, priority, dueDate } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, error: 'Please provide a title' });
    }

    const task = await Task.create({
      title,
      description,
      status,
      priority,
      dueDate
    });

    res.status(201).json({ success: true, data: task });
  } catch (error) {
    res.status(400).json({ success: false, error: 'Validation Error', message: error.message });
  }
};

// @desc    Update a task
// @route   PUT /api/tasks/:id
// @access  Public
export const updateTask = async (req, res) => {
  try {
    const { title, description, status, priority, dueDate } = req.body;

    let task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    task = await Task.findByIdAndUpdate(
      req.params.id,
      { title, description, status, priority, dueDate },
      { new: true, runValidators: true }
    );

    res.status(200).json({ success: true, data: task });
  } catch (error) {
    res.status(400).json({ success: false, error: 'Validation Error', message: error.message });
  }
};

// @desc    Delete a task
// @route   DELETE /api/tasks/:id
// @access  Public
export const deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    await task.deleteOne();
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server Error', message: error.message });
  }
};
