import React, { createContext, useContext, useState } from 'react';

const TaskContext = createContext(undefined);

export const TaskProvider = ({ children }) => {
  const [tasks, setTasks] = useState({});

  const startTask = async (taskId, taskFn) => {
    if (!taskId) return;

    setTasks((prev) => ({
      ...prev,
      [taskId]: {
        status: 'running',
        data: null,
        error: null,
      },
    }));

    try {
      const data = await taskFn();
      setTasks((prev) => ({
        ...prev,
        [taskId]: {
          status: 'success',
          data,
          error: null,
        },
      }));
      return data;
    } catch (error) {
      setTasks((prev) => ({
        ...prev,
        [taskId]: {
          status: 'error',
          data: null,
          error,
        },
      }));
      throw error;
    }
  };

  const clearTask = (taskId) => {
    if (!taskId) return;
    setTasks((prev) => {
      const copy = { ...prev };
      delete copy[taskId];
      return copy;
    });
  };

  return (
    <TaskContext.Provider value={{ tasks, startTask, clearTask }}>
      {children}
    </TaskContext.Provider>
  );
};

export const useTasks = () => {
  const context = useContext(TaskContext);
  if (context === undefined) {
    throw new Error('useTasks must be used within a TaskProvider');
  }
  return context;
};
