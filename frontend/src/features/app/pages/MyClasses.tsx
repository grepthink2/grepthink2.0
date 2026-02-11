import React from 'react';
import { useClass } from '@/lib/classContext';
//import { api } from '@/lib/api';

const MyClasses: React.FC = () => {
    const { classes, loading } = useClass();
    //temp
    if (loading) return <p>Loading...</p>;


    return (
        <ul>
            {classes.map((c) => (
                <li key={c.id}>
                    {c.course_code} - {c.name} ({c.created_by})
                </li>
            ))}
        </ul>

    );
};

export default MyClasses;