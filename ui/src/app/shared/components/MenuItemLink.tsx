import React from "react";
import { MenuItem } from "@mui/material";
import { NavLink } from "react-router-dom";

export default function MenuItemLink({children, to}: {children: React.ReactNode, to: string}) {
  return (
    <MenuItem component={NavLink} to={to} 
        sx={{
        fontSize: '1.2rem', 
        textTransform: 'uppercase',
        fontWeight: 'bold',
        color: 'inherit',
        '&.active': {color: 'yellow'} 
        }}>
        {children}
    </MenuItem>
  )
}