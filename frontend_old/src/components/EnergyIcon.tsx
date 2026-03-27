import React from "react";

interface EnergyIconProps {
    className?: string;
    size?: number;
    color?: string;
}

export const EnergyIcon: React.FC<EnergyIconProps> = ({
    className = "",
    size = 20,
    color = "currentColor"
}) => {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            style={{ display: 'inline-block', verticalAlign: 'middle' }}
        >
            <path
                d="M13 3L6 14H11V21L18 10H13V3Z"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
};
