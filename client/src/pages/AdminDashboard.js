import React, { useState, useEffect } from 'react';
import {
    Container,
    Typography,
    Box,
    Grid,
    Card,
    CardContent,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    CircularProgress,
    IconButton,
    Tooltip,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
} from '@mui/material';
import {
    People,
    School,
    Add,
    Delete,
    Edit,
    Security,
    PersonAdd,
} from '@mui/icons-material';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const AdminDashboard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [users, setUsers] = useState([]);
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null); // { type: 'user' | 'course', id: 1 }

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [usersRes, coursesRes] = await Promise.all([
                axios.get('/api/users'),
                axios.get('/api/courses'),
            ]);
            setUsers(usersRes.data.users);
            setCourses(coursesRes.data.courses);
        } catch (error) {
            console.error('Error fetching admin data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteClick = (type, id) => {
        setItemToDelete({ type, id });
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        try {
            if (itemToDelete.type === 'user') {
                // Implement delete user endpoint if available or show error
                // Current backend might functionality check
                alert('Delete user functionality implementing...');
            } else if (itemToDelete.type === 'course') {
                await axios.delete(`/api/courses/${itemToDelete.id}`);
                setCourses(courses.filter(c => c.id !== itemToDelete.id));
            }
            setDeleteDialogOpen(false);
        } catch (error) {
            console.error('Error deleting item:', error);
            alert('Failed to delete item');
        }
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
                <CircularProgress size={60} />
            </Box>
        );
    }

    return (
        <Container maxWidth="lg" sx={{ py: 8 }}>
            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="h4" component="h1" gutterBottom fontWeight="bold" className="gradient-text">
                        Admin Dashboard
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Manage users, courses, and platform content.
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button
                        variant="contained"
                        startIcon={<PersonAdd />}
                        component={Link}
                        to="/admin/users/add"
                        sx={{
                            borderRadius: 2,
                            background: 'linear-gradient(135deg, #00d2ff 0%, #3a7bd5 100%)',
                            textTransform: 'none',
                            fontWeight: 'bold'
                        }}
                        className="hover-glow"
                    >
                        Add User
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<Add />}
                        component={Link}
                        to="/admin/courses/add"
                        sx={{
                            borderRadius: 2,
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            textTransform: 'none',
                            fontWeight: 'bold'
                        }}
                        className="hover-glow"
                    >
                        Add Course
                    </Button>
                </Box>
            </Box>

            <Grid container spacing={4} sx={{ mb: 6 }}>
                <Grid item xs={12} md={6}>
                    <Card className="glass-panel" sx={{ height: '100%' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                                <People sx={{ mr: 2, color: 'primary.main', fontSize: 32 }} />
                                <Typography variant="h5" fontWeight="bold">Recent Users</Typography>
                            </Box>
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>User</TableCell>
                                            <TableCell>Role</TableCell>
                                            <TableCell align="right">Actions</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {users.slice(0, 5).map((u) => (
                                            <TableRow key={u.id} hover>
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight="500">{u.full_name}</Typography>
                                                    <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={u.role}
                                                        size="small"
                                                        color={u.role === 'admin' ? 'secondary' : u.role === 'teacher' ? 'primary' : 'default'}
                                                        variant="outlined"
                                                    />
                                                </TableCell>
                                                <TableCell align="right">
                                                    <IconButton size="small" color="error" onClick={() => handleDeleteClick('user', u.id)}>
                                                        <Delete fontSize="small" />
                                                    </IconButton>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                            <Box sx={{ mt: 2, textAlign: 'center' }}>
                                <Button component={Link} to="/admin/users">View All Users</Button>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Card className="glass-panel" sx={{ height: '100%' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                                <School sx={{ mr: 2, color: 'secondary.main', fontSize: 32 }} />
                                <Typography variant="h5" fontWeight="bold">Recent Courses</Typography>
                            </Box>
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Title</TableCell>
                                            <TableCell>Category</TableCell>
                                            <TableCell align="right">Actions</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {courses.slice(0, 5).map((c) => (
                                            <TableRow key={c.id} hover>
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight="500">{c.title}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="caption">{c.category}</Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <IconButton size="small" color="primary" component={Link} to={`/admin/courses/edit/${c.id}`}>
                                                        <Edit fontSize="small" />
                                                    </IconButton>
                                                    <IconButton size="small" color="error" onClick={() => handleDeleteClick('course', c.id)}>
                                                        <Delete fontSize="small" />
                                                    </IconButton>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                            <Box sx={{ mt: 2, textAlign: 'center' }}>
                                <Button component={Link} to="/admin/courses">View All Courses</Button>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            <Dialog
                open={deleteDialogOpen}
                onClose={() => setDeleteDialogOpen(false)}
            >
                <DialogTitle>Confirm Delete</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete this {itemToDelete?.type}? This action cannot be undone.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleDeleteConfirm} color="error" autoFocus>
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
};

export default AdminDashboard;
